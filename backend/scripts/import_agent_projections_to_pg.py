"""One-shot import: legacy agent JSONL projections -> PostgreSQL (if present).

Reads the former projection files under ``<data-dir>/agent`` and writes them to
the ``proposals`` / ``runs`` / ``stream_events`` tables:

    proposals.jsonl        one StrategyProposal per line
    runs.jsonl             research / execution run status records
    streams/<stem>.jsonl   per-thread SSE frames (append order preserved)

Idempotent: proposals / runs upsert on their natural key; a legacy stream is
replaced thread-by-thread (delete-then-insert in one transaction) so a re-run
cannot duplicate frames. The source JSONL is never modified or deleted.

Thread ids contain ``:`` and the old files were named with the filesystem-safe
``safe_thread_component`` mapping (``:`` -> ``_``), which is **lossy** and cannot
be reversed. The true ids ARE recoverable from ``runs.jsonl`` (its
``thread_id`` field), so the script builds a ``stem -> thread_id`` map from it
and uses that. A stream file with no matching run falls back to the raw stem and
is reported (its ``:`` is unrecoverable).

Usage::

    python scripts/import_agent_projections_to_pg.py [--dry-run] [--data-dir PATH] [--dsn DSN]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from psycopg.types.json import Jsonb

from market_data.agent.proposal import StrategyProposal
from market_data.agent.store import safe_thread_component
from market_data.config import get_settings
from market_data.db import get_database


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(record, dict):
            out.append(record)
    return out


def _parse_ts(raw: Any) -> datetime | None:  # noqa: ANN401 - untyped JSON value
    if not isinstance(raw, str):
        return None
    try:
        moment = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment


def _thread_map(runs: list[dict]) -> dict[str, str]:
    """Recover ``safe_thread_component(thread_id) -> thread_id`` from runs.jsonl."""
    mapping: dict[str, str] = {}
    for run in runs:
        thread_id = run.get("thread_id") or run.get("run_id")
        if isinstance(thread_id, str) and thread_id:
            mapping[safe_thread_component(thread_id)] = thread_id
    return mapping


def run(data_dir: Path, dsn: str, *, dry_run: bool) -> int:
    agent_dir = data_dir / "agent"
    proposals_path = agent_dir / "proposals.jsonl"
    runs_path = agent_dir / "runs.jsonl"
    streams_dir = agent_dir / "streams"

    proposals = _read_jsonl(proposals_path)
    runs = _read_jsonl(runs_path)
    stream_files = sorted(streams_dir.glob("*.jsonl")) if streams_dir.exists() else []

    print(f"[import] proposals: read {len(proposals)} line(s) from {proposals_path}")
    print(f"[import] runs: read {len(runs)} line(s) from {runs_path}")

    thread_map = _thread_map(runs)
    streams: list[tuple[str, list[dict]]] = []
    if not stream_files:
        print(f"[import] streams: no *.jsonl under {streams_dir}")
    for path in stream_files:
        thread_id = thread_map.get(path.stem)
        if thread_id is None:
            thread_id = path.stem
            print(
                f"[import] streams: {path.name} unmatched in runs.jsonl; "
                f"using lossy stem {thread_id!r} (original ':' unrecoverable)"
            )
        events = _read_jsonl(path)
        streams.append((thread_id, events))
        print(
            f"[import] streams: read {len(events)} frame(s) from {path.name} "
            f"-> thread_id={thread_id!r}"
        )

    if dry_run:
        print("[import] --dry-run, nothing written.")
        return 0

    database = get_database(dsn)
    database.bootstrap()

    written_proposals = 0
    for record in proposals:
        try:
            dump = StrategyProposal.model_validate(record).model_dump(mode="json")
        except Exception as exc:  # noqa: BLE001 - report and keep the rest of the batch
            print(f"[import] proposals: skipping invalid record: {exc}")
            continue
        with database.connection() as conn:
            conn.execute(
                "INSERT INTO proposals (proposal_id, produced_at, kind, record) "
                "VALUES (%s, %s, %s, %s) "
                "ON CONFLICT (proposal_id) DO UPDATE SET "
                "produced_at = EXCLUDED.produced_at, kind = EXCLUDED.kind, "
                "record = EXCLUDED.record",
                (
                    dump["proposal_id"],
                    _parse_ts(dump.get("produced_at")),
                    dump.get("action"),
                    Jsonb(dump),
                ),
            )
        written_proposals += 1

    written_runs = 0
    for record in runs:
        run_id = record.get("run_id")
        if not isinstance(run_id, str) or not run_id:
            print("[import] runs: skipping record without run_id")
            continue
        with database.connection() as conn:
            conn.execute(
                "INSERT INTO runs "
                "(run_id, thread_id, kind, status, started_at, finished_at, record) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (run_id) DO UPDATE SET "
                "thread_id = EXCLUDED.thread_id, kind = EXCLUDED.kind, "
                "status = EXCLUDED.status, started_at = EXCLUDED.started_at, "
                "finished_at = EXCLUDED.finished_at, record = EXCLUDED.record",
                (
                    run_id,
                    record.get("thread_id"),
                    record.get("kind"),
                    record.get("status"),
                    _parse_ts(record.get("started_at")),
                    _parse_ts(record.get("finished_at")),
                    Jsonb(record),
                ),
            )
        written_runs += 1

    written_events = 0
    for thread_id, events in streams:
        with database.connection() as conn, conn.transaction():
            conn.execute("DELETE FROM stream_events WHERE thread_id = %s", (thread_id,))
            for event in events:
                conn.execute(
                    "INSERT INTO stream_events (thread_id, seq, type, payload) "
                    "VALUES (%s, %s, %s, %s)",
                    (thread_id, event.get("seq"), str(event.get("type") or "event"), Jsonb(event)),
                )
        written_events += len(events)

    print(
        f"[import] wrote {written_proposals} proposal(s), {written_runs} run(s), "
        f"{written_events} stream frame(s) across {len(streams)} thread(s): "
        f"{[thread_id for thread_id, _ in streams]}"
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=settings.data_dir)
    parser.add_argument("--dsn", default=settings.postgres_dsn)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    return run(args.data_dir, args.dsn, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
