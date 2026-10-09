"""One-shot, idempotent import: alerts JSON -> PostgreSQL `alerts`.

Reads ``<data-dir>/alerts/alerts.json`` (the legacy array, newest-first) and
upserts every row with ``ON CONFLICT (id) DO UPDATE``. The array index is mapped
to ``seq`` (``seq = len - index``) so the list order is preserved
(``ORDER BY seq DESC``). The sequence is re-synced afterwards so future inserts
never collide with imported values. The source file is never modified or deleted.

Usage::

    python scripts/import_alerts_to_pg.py [--dry-run] [--data-dir PATH] [--dsn DSN]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from market_data.config import get_settings
from market_data.db import get_database

_UPSERT = """
    INSERT INTO alerts
        (id, symbol, condition, threshold, enabled, triggered, created_at, color, seq)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (id) DO UPDATE SET
        symbol = EXCLUDED.symbol,
        condition = EXCLUDED.condition,
        threshold = EXCLUDED.threshold,
        enabled = EXCLUDED.enabled,
        triggered = EXCLUDED.triggered,
        created_at = EXCLUDED.created_at,
        color = EXCLUDED.color,
        seq = EXCLUDED.seq
"""


def run(data_dir: Path, dsn: str, *, dry_run: bool) -> int:
    src = data_dir / "alerts" / "alerts.json"
    if not src.exists():
        print(f"[import] alerts: no JSON at {src}; nothing to do.")
        return 0

    raw = json.loads(src.read_text(encoding="utf-8"))
    rows = [a for a in raw if isinstance(a, dict) and isinstance(a.get("id"), str)]
    print(f"[import] alerts: read {len(rows)} row(s) from {src}")
    if dry_run:
        print("[import] alerts: --dry-run, nothing written.")
        return 0

    database = get_database(dsn)
    database.bootstrap()
    total = len(rows)
    with database.connection() as conn, conn.transaction():
        for index, row in enumerate(rows):
            conn.execute(
                _UPSERT,
                (
                    row["id"],
                    str(row.get("symbol") or ""),
                    row.get("condition"),
                    float(row.get("threshold") or 0.0),
                    bool(row.get("enabled", True)),
                    bool(row.get("triggered", False)),
                    int(row.get("createdAt") or 0),
                    str(row["color"]) if row.get("color") else None,
                    total - index,
                ),
            )
        conn.execute(
            "SELECT setval(pg_get_serial_sequence('alerts', 'seq'), "
            "GREATEST((SELECT COALESCE(MAX(seq), 1) FROM alerts), 1))"
        )
    with database.connection() as conn:
        count = conn.execute("SELECT count(*) AS n FROM alerts").fetchone()["n"]
    print(f"[import] alerts: upserted {total} row(s); table now has {count} row(s).")
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
