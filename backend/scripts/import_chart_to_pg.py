"""One-shot, idempotent import: chart config JSON -> PostgreSQL `chart_config`.

Reads ``<data-dir>/config/chart.json`` (dict keyed ``"<category>/<symbol>/<timeframe>"``)
and upserts each value as ``state`` jsonb with ``ON CONFLICT (...) DO UPDATE``.
The key is split on the first two ``/`` only, so keys are never normalized
(``1H`` stays distinct from ``1h``). The source file is never modified or deleted.

Usage::

    python scripts/import_chart_to_pg.py [--dry-run] [--data-dir PATH] [--dsn DSN]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from psycopg.types.json import Jsonb

from market_data.config import get_settings
from market_data.db import get_database

_UPSERT = """
    INSERT INTO chart_config (category, symbol, timeframe, state)
    VALUES (%s, %s, %s, %s)
    ON CONFLICT (category, symbol, timeframe) DO UPDATE
        SET state = EXCLUDED.state, updated_at = now()
"""


def run(data_dir: Path, dsn: str, *, dry_run: bool) -> int:
    src = data_dir / "config" / "chart.json"
    if not src.exists():
        print(f"[import] chart: no JSON at {src}; nothing to do.")
        return 0

    raw = json.loads(src.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        print(f"[import] chart: {src} is not a JSON object; nothing to do.")
        return 0

    rows: list[tuple[str, str, str, dict]] = []
    for key, state in raw.items():
        parts = key.split("/", 2)
        if len(parts) != 3:
            print(f"[import] chart: skipping malformed key {key!r}")
            continue
        rows.append((parts[0], parts[1], parts[2], state))
    print(f"[import] chart: read {len(rows)} series from {src}")
    if dry_run:
        print("[import] chart: --dry-run, nothing written.")
        return 0

    database = get_database(dsn)
    database.bootstrap()
    with database.connection() as conn, conn.transaction():
        for category, symbol, timeframe, state in rows:
            conn.execute(_UPSERT, (category, symbol, timeframe, Jsonb(state)))
    with database.connection() as conn:
        count = conn.execute("SELECT count(*) AS n FROM chart_config").fetchone()["n"]
    print(f"[import] chart: upserted {len(rows)} series; table now has {count} row(s).")
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
