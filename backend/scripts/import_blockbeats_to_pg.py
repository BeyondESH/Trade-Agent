"""One-shot, idempotent import: BlockBeats cache JSON files -> PostgreSQL.

Reads every ``<data-dir>/blockbeats_cache/*.json`` (each ``{"fetched_at", "data"}``)
and upserts one row per file into ``blockbeats_cache``. The file stem becomes
``cache_key`` (so it stays unique); the stem is parsed into
``(endpoint, network, type)`` using the module's endpoint sets. The original
``fetched_at`` is preserved. Source files are never modified or deleted.

Usage::

    python scripts/import_blockbeats_to_pg.py [--dry-run] [--data-dir PATH] [--dsn DSN]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from psycopg.types.json import Jsonb

from market_data.blockbeats_cache import NETWORK_END_POINTS, TYPE_END_POINTS
from market_data.config import get_settings
from market_data.db import get_database

_UPSERT = """
    INSERT INTO blockbeats_cache (cache_key, endpoint, network, type, fetched_at, data)
    VALUES (%s, %s, %s, %s, %s, %s)
    ON CONFLICT (cache_key) DO UPDATE SET
        endpoint = EXCLUDED.endpoint,
        network = EXCLUDED.network,
        type = EXCLUDED.type,
        fetched_at = EXCLUDED.fetched_at,
        data = EXCLUDED.data
"""


def _parse_stem(stem: str) -> tuple[str, str | None, str | None]:
    parts = stem.split(".")
    endpoint = parts[0]
    param = parts[1] if len(parts) > 1 else None
    network = param if endpoint in NETWORK_END_POINTS else None
    type_ = param if endpoint in TYPE_END_POINTS else None
    return endpoint, network, type_


def _parse_fetched_at(value: object) -> datetime:
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        except ValueError:
            pass
    return datetime.now(UTC)


def run(data_dir: Path, dsn: str, *, dry_run: bool) -> int:
    src_dir = data_dir / "blockbeats_cache"
    if not src_dir.is_dir():
        print(f"[import] blockbeats: no cache dir at {src_dir}; nothing to do.")
        return 0

    files = sorted(src_dir.glob("*.json"))
    if not files:
        print(f"[import] blockbeats: no JSON files under {src_dir}; nothing to do.")
        return 0

    rows: list[tuple[str, str, str | None, str | None, datetime, object]] = []
    for path in files:
        try:
            obj = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"[import] blockbeats: skipping unreadable {path}: {exc}")
            continue
        if not isinstance(obj, dict):
            print(f"[import] blockbeats: skipping non-object {path}")
            continue
        endpoint, network, type_ = _parse_stem(path.stem)
        rows.append(
            (
                path.stem,
                endpoint,
                network,
                type_,
                _parse_fetched_at(obj.get("fetched_at")),
                obj.get("data"),
            )
        )
    print(f"[import] blockbeats: read {len(rows)} file(s) from {src_dir}")
    if dry_run:
        print("[import] blockbeats: --dry-run, nothing written.")
        return 0

    database = get_database(dsn)
    database.bootstrap()
    with database.connection() as conn, conn.transaction():
        for row in rows:
            cache_key, endpoint, network, type_, fetched_at, data = row
            conn.execute(
                _UPSERT,
                (cache_key, endpoint, network, type_, fetched_at, Jsonb(data)),
            )
    with database.connection() as conn:
        count = conn.execute("SELECT count(*) AS n FROM blockbeats_cache").fetchone()["n"]
    print(f"[import] blockbeats: upserted {len(rows)} row(s); table now has {count} row(s).")
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
