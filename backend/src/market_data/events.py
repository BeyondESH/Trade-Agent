"""Bounded append-only event log (circuit-breaker events) in PostgreSQL.

Phase 1 of the JSONL -> PostgreSQL migration. Each event carries
``id``/``ts``/``kind``/``payload``; the log is bounded by ``max_events`` **per
source (kind)** - appending past the cap prunes the oldest entries of that
source inside the same transaction, so the log cannot become a new unbounded
growth source.

The former JSONL store used a lock + rewrite-on-overflow and silently skipped
malformed lines; a row in ``events`` is type-validated by the schema, so there
are no corrupt lines to skip. The public API (``append`` / ``list`` with the
same oldest-first ordering and newest-``limit`` slicing) is unchanged.
"""

from __future__ import annotations

import time
import uuid

from psycopg.types.json import Jsonb

from market_data.db import Database, get_database

DEFAULT_MAX_EVENTS = 200


class EventLog:
    def __init__(
        self,
        database: Database | None = None,
        max_events: int = DEFAULT_MAX_EVENTS,
        *,
        dsn: str | None = None,
    ) -> None:
        self._db = database or get_database(dsn)
        self.max_events = max(1, int(max_events))

    # -- API ---------------------------------------------------------------
    def append(self, kind: str, payload: dict | None = None) -> dict:
        entry = {
            "id": uuid.uuid4().hex[:12],
            "ts": int(time.time() * 1000),
            "kind": str(kind),
            "payload": payload or {},
        }
        with self._db.connection() as conn, conn.transaction():
            conn.execute(
                "INSERT INTO events (source, id, ts, payload) VALUES (%s, %s, %s, %s)",
                (entry["kind"], entry["id"], entry["ts"], Jsonb(entry["payload"])),
            )
            # Keep only the newest `max_events` rows for this source. The subquery
            # yields the cutoff seq (the oldest row to keep); with fewer rows than
            # the cap it returns NULL and `seq < NULL` deletes nothing.
            conn.execute(
                "DELETE FROM events WHERE source = %s AND seq < ("
                "  SELECT seq FROM events WHERE source = %s ORDER BY seq DESC OFFSET %s LIMIT 1"
                ")",
                (entry["kind"], entry["kind"], self.max_events - 1),
            )
        return entry

    def list(self, kind: str | None = None, limit: int = 100) -> list[dict]:
        """Read events oldest-first; ``limit`` caps to the newest N (None = all)."""
        with self._db.connection() as conn:
            if kind is not None:
                rows = conn.execute(
                    "SELECT id, ts, source, payload FROM events WHERE source = %s ORDER BY seq ASC",
                    (kind,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT id, ts, source, payload FROM events ORDER BY seq ASC"
                ).fetchall()
        entries = [
            {
                "id": row["id"],
                "ts": row["ts"],
                "kind": row["source"],
                "payload": row["payload"],
            }
            for row in rows
        ]
        if limit is not None:
            entries = entries[-limit:] if limit > 0 else []
        return entries
