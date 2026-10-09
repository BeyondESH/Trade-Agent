"""One-shot import: legacy JSONL event log -> PostgreSQL `events` (if present).

The event log is not wired in production yet, so there is usually no source
file. This script checks the known legacy locations and reports their absence
(exit 0). When a file is found it imports it idempotently: ``(source, seq)`` is
derived from the file order (``seq`` is assigned in read order) and
``ON CONFLICT DO NOTHING`` prevents duplicates on re-run. The source file is
never modified or deleted.

Usage::

    python scripts/import_events_to_pg.py [--dry-run] [--data-dir PATH] [--dsn DSN]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from psycopg.types.json import Jsonb

from market_data.config import get_settings
from market_data.db import get_database

_CANDIDATES = ("events.jsonl", "agent/events.jsonl")


def _candidate_paths(data_dir: Path) -> list[Path]:
    return [data_dir / rel for rel in _CANDIDATES]


def run(data_dir: Path, dsn: str, *, dry_run: bool) -> int:
    sources = [p for p in _candidate_paths(data_dir) if p.exists()]
    if not sources:
        checked = ", ".join(str(p) for p in _candidate_paths(data_dir))
        print(f"[import] events: no production JSONL event log found (checked: {checked}).")
        return 0

    rows: list[dict] = []
    for path in sources:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(entry, dict) and isinstance(entry.get("id"), str):
                rows.append(entry)
    print(f"[import] events: read {len(rows)} event(s) from {', '.join(map(str, sources))}")
    if dry_run:
        print("[import] events: --dry-run, nothing written.")
        return 0

    database = get_database(dsn)
    database.bootstrap()
    per_source: dict[str, int] = {}
    with database.connection() as conn, conn.transaction():
        for entry in rows:
            source = str(entry.get("kind") or "unknown")
            seq = per_source.get(source, 0) + 1
            per_source[source] = seq
            conn.execute(
                "INSERT INTO events (source, seq, id, ts, payload) VALUES (%s, %s, %s, %s, %s) "
                "ON CONFLICT (source, seq) DO NOTHING",
                (
                    source,
                    seq,
                    entry["id"],
                    int(entry.get("ts") or 0),
                    Jsonb(entry.get("payload") or {}),
                ),
            )
    print(f"[import] events: upserted {len(rows)} event(s) across {len(per_source)} source(s).")
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
