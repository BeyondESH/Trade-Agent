"""Projection / audit store for the agent layer (agent-runtime, design D4).

PostgreSQL-backed (Phase 3 of the "all persistence -> PostgreSQL" migration).
The worker is the only writer; the FastAPI process only reads. Three tables in
the shared database (see ``market_data.db.SCHEMA_SQL``):

    stream_events   per-thread SSE frames, ordered by a GLOBAL bigserial cursor
    proposals       one StrategyProposal per row (``record`` = full model_dump)
    runs            research / execution run status records

The former implementation appended JSONL under ``settings.agent_dir`` and
re-read the whole file to compute a per-file record count. The public API
(``append_*`` / ``list_*`` / ``get_*`` / ``read_stream``) and its observable
semantics are unchanged; only the medium moved. Two details are deliberate:

* **Stream cursor.** ``read_stream(thread_id, cursor)`` returns the frames whose
  global row ``id`` is strictly greater than ``cursor`` and returns the ``id`` of
  the last delivered row as the next cursor (or the input cursor unchanged when
  nothing new arrived). ``read_stream(thread_id, 0)`` therefore means "from the
  beginning". This is the row ``id``, NOT the payload's ``seq``: ``seq`` is a
  per-run counter that ``capture_stream`` resets to 0 on every run, so it cannot
  order a stream across runs (and ``error`` frames carry no ``seq`` at all).
* **Corrupt lines.** The JSONL reader silently skipped blank / non-dict /
  malformed lines. Rows are schema-validated on insert, so that case no longer
  exists; there is nothing equivalent to skip.

``safe_thread_component`` is retained for the one-shot legacy import script
(``scripts/import_agent_projections_to_pg.py``); the database stores the raw
thread id and needs no filesystem-safe mapping.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from psycopg.types.json import Jsonb

from market_data.agent.proposal import StrategyProposal
from market_data.db import Database, get_database

_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")

# Keys surfaced by the read-only proposals list endpoint.
PROPOSAL_META_KEYS: tuple[str, ...] = (
    "proposal_id",
    "symbol",
    "category",
    "timeframe",
    "action",
    "confidence",
    "produced_at",
    "expires_at",
    "horizon",
)


def safe_thread_component(thread_id: str) -> str:
    """Legacy: map a thread id to the filesystem-safe stem the JSONL store used.

    Only the one-shot import script needs this (to locate the old
    ``streams/<stem>.jsonl`` files). Live storage keeps the raw thread id.
    """
    return _UNSAFE.sub("_", thread_id).strip("_") or "unnamed"


def _parse_ts(raw: Any) -> datetime | None:  # noqa: ANN401 - untyped JSON value
    """Parse an ISO timestamp, treating a naive value as UTC (matches the old store)."""
    if not isinstance(raw, str):
        return None
    try:
        moment = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment


def proposal_meta(record: dict) -> dict:
    """Trim a stored proposal record to the list-view projection."""
    return {key: record.get(key) for key in PROPOSAL_META_KEYS}


class ProjectionStore:
    """PostgreSQL projections + stream audit (worker writes, API reads)."""

    def __init__(
        self,
        database: Database | None = None,
        *,
        dsn: str | None = None,
    ) -> None:
        self._db = database or get_database(dsn)

    # -- writes ------------------------------------------------------------
    def append_proposal(self, proposal: StrategyProposal) -> dict:
        record = proposal.model_dump(mode="json")
        with self._db.connection() as conn:
            conn.execute(
                "INSERT INTO proposals (proposal_id, produced_at, kind, record) "
                "VALUES (%s, %s, %s, %s) "
                "ON CONFLICT (proposal_id) DO UPDATE SET "
                "produced_at = EXCLUDED.produced_at, kind = EXCLUDED.kind, "
                "record = EXCLUDED.record",
                (
                    record["proposal_id"],
                    _parse_ts(record.get("produced_at")),
                    record.get("action"),
                    Jsonb(record),
                ),
            )
        return record

    def append_run(self, run: dict[str, Any]) -> dict:
        record = dict(run)
        with self._db.connection() as conn:
            conn.execute(
                "INSERT INTO runs "
                "(run_id, thread_id, kind, status, started_at, finished_at, record) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (run_id) DO UPDATE SET "
                "thread_id = EXCLUDED.thread_id, kind = EXCLUDED.kind, "
                "status = EXCLUDED.status, started_at = EXCLUDED.started_at, "
                "finished_at = EXCLUDED.finished_at, record = EXCLUDED.record",
                (
                    record.get("run_id"),
                    record.get("thread_id"),
                    record.get("kind"),
                    record.get("status"),
                    _parse_ts(record.get("started_at")),
                    _parse_ts(record.get("finished_at")),
                    Jsonb(record),
                ),
            )
        return record

    def append_stream_event(self, thread_id: str, event: dict[str, Any]) -> dict:
        record = dict(event)
        with self._db.connection() as conn:
            conn.execute(
                "INSERT INTO stream_events (thread_id, seq, type, payload) VALUES (%s, %s, %s, %s)",
                (
                    thread_id,
                    record.get("seq"),
                    str(record.get("type") or "event"),
                    Jsonb(record),
                ),
            )
        return record

    # -- reads -------------------------------------------------------------
    def list_proposals(
        self, symbol: str | None = None, limit: int = 100, since_ms: int | None = None
    ) -> list[dict]:
        """Newest-first stored proposals, optionally filtered by symbol / time.

        Mirrors the old JSONL semantics exactly: filter, then keep the last
        ``limit`` in append order and reverse (``ORDER BY id DESC LIMIT``).
        """
        if limit is not None and limit <= 0:
            return []
        clauses: list[str] = []
        params: list[Any] = []
        if symbol:
            clauses.append("record->>'symbol' = %s")
            params.append(symbol)
        if since_ms is not None:
            # The old filter parsed the record's ISO `produced_at` (naive -> UTC)
            # to integer milliseconds; reproduce that comparison in SQL. The
            # `floor` matches the old `int(timestamp * 1000)` truncation.
            clauses.append("COALESCE(floor(EXTRACT(EPOCH FROM produced_at) * 1000), 0) >= %s")
            params.append(since_ms)
        sql = "SELECT record FROM proposals"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY id DESC"
        if limit is not None:
            sql += " LIMIT %s"
            params.append(limit)
        with self._db.connection() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [row["record"] for row in rows]

    def get_proposal(self, proposal_id: str) -> dict | None:
        with self._db.connection() as conn:
            row = conn.execute(
                "SELECT record FROM proposals WHERE proposal_id = %s", (proposal_id,)
            ).fetchone()
        return row["record"] if row is not None else None

    def list_runs(self, kind: str | None = None, limit: int = 100) -> list[dict]:
        if limit is not None and limit <= 0:
            return []
        sql = "SELECT record FROM runs"
        params: list[Any] = []
        if kind:
            sql += " WHERE kind = %s"
            params.append(kind)
        sql += " ORDER BY id DESC"
        if limit is not None:
            sql += " LIMIT %s"
            params.append(limit)
        with self._db.connection() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [row["record"] for row in rows]

    def get_run(self, run_id: str) -> dict | None:
        with self._db.connection() as conn:
            row = conn.execute("SELECT record FROM runs WHERE run_id = %s", (run_id,)).fetchone()
        return row["record"] if row is not None else None

    def has_stream(self, thread_id: str) -> bool:
        """True when at least one frame exists for ``thread_id`` (the 404 gate)."""
        with self._db.connection() as conn:
            row = conn.execute(
                "SELECT 1 FROM stream_events WHERE thread_id = %s LIMIT 1", (thread_id,)
            ).fetchone()
        return row is not None

    def read_stream(self, thread_id: str, cursor: int = 0) -> tuple[list[dict], int]:
        """Return ``(new_frames, next_cursor)`` after the global row ``id`` cursor.

        ``cursor`` is the ``id`` returned by the previous call; ``0`` starts at
        the beginning. ``next_cursor`` is the last delivered ``id`` (unchanged
        when no new frames arrived), so a subsequent call with it yields ``[]``.
        """
        start = max(0, cursor)
        with self._db.connection() as conn:
            rows = conn.execute(
                "SELECT id, payload FROM stream_events "
                "WHERE thread_id = %s AND id > %s ORDER BY id ASC",
                (thread_id, start),
            ).fetchall()
        events = [row["payload"] for row in rows]
        next_cursor = rows[-1]["id"] if rows else start
        return events, next_cursor
