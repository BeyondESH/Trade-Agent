"""One-shot, idempotent import: Parquet candle day-files -> PostgreSQL ``candles``.

Walks ``<data-dir>/parquet/<category>/<symbol>/<timeframe>/*.parquet`` (one file
per UTC day of the bar open), reads every file, and upserts each bar with
``ON CONFLICT (category, symbol, timeframe, open_time) DO UPDATE`` so a second
run converges to exactly the same rows. The Parquet files are only ever read -
never modified or deleted - so the import can be re-run and audited.

Usage::

    python scripts/import_candles_to_pg.py [--dry-run] [--data-dir PATH] [--dsn DSN]
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Iterator
from pathlib import Path

import pandas as pd

from market_data.config import get_settings
from market_data.db import get_database
from market_data.models import OHLCV_COLUMNS

_ROW_PLACEHOLDER = "(%s, %s, %s, %s, %s, %s, %s, %s, %s)"
_UPSERT_TEMPLATE = (
    "INSERT INTO candles "
    "(category, symbol, timeframe, open_time, open, high, low, close, volume) "
    "VALUES {placeholders} "
    "ON CONFLICT (category, symbol, timeframe, open_time) DO UPDATE SET "
    "open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, "
    "close = EXCLUDED.close, volume = EXCLUDED.volume"
)
_MAX_ROWS_PER_INSERT = 5000


def _series_dirs(parquet_dir: Path) -> Iterator[tuple[str, str, str, list[Path]]]:
    for cat_dir in sorted(p for p in parquet_dir.iterdir() if p.is_dir()):
        for sym_dir in sorted(p for p in cat_dir.iterdir() if p.is_dir()):
            for tf_dir in sorted(p for p in sym_dir.iterdir() if p.is_dir()):
                files = sorted(tf_dir.glob("*.parquet"))
                if files:
                    yield cat_dir.name, sym_dir.name, tf_dir.name, files


def _load(files: list[Path]) -> pd.DataFrame:
    frames = [pd.read_parquet(f)[OHLCV_COLUMNS] for f in files]
    combined = pd.concat(frames, ignore_index=True)
    combined["open_time"] = combined["open_time"].astype("int64")
    combined = combined.drop_duplicates(subset="open_time", keep="last")
    return combined.sort_values("open_time").reset_index(drop=True)


def _upsert_rows(conn, category: str, symbol: str, timeframe: str, frame: pd.DataFrame) -> int:  # noqa: ANN001
    rows = [
        (
            category,
            symbol,
            timeframe,
            int(open_time),
            float(open_),
            float(high),
            float(low),
            float(close),
            float(volume),
        )
        for open_time, open_, high, low, close, volume in frame[OHLCV_COLUMNS].itertuples(
            index=False
        )
    ]
    for start in range(0, len(rows), _MAX_ROWS_PER_INSERT):
        chunk = rows[start : start + _MAX_ROWS_PER_INSERT]
        placeholders = ", ".join([_ROW_PLACEHOLDER] * len(chunk))
        params = tuple(value for row in chunk for value in row)
        conn.execute(_UPSERT_TEMPLATE.format(placeholders=placeholders), params)
    return len(rows)


def run(data_dir: Path, dsn: str, *, dry_run: bool) -> int:
    parquet_dir = data_dir / "parquet"
    if not parquet_dir.exists():
        print(f"[import] candles: no parquet directory at {parquet_dir}; nothing to do.")
        return 0

    series = list(_series_dirs(parquet_dir))
    if not series:
        print(f"[import] candles: no .parquet day-files under {parquet_dir}; nothing to do.")
        return 0

    total_files = sum(len(files) for *_, files in series)
    print(
        f"[import] candles: found {len(series)} series, {total_files} day-file(s) "
        f"under {parquet_dir}"
    )

    if dry_run:
        total_rows = 0
        for category, symbol, timeframe, files in series:
            frame = _load(files)
            total_rows += len(frame)
            print(
                f"[import] candles: {category}/{symbol}/{timeframe}: "
                f"{len(files)} file(s), {len(frame)} row(s) (dry-run)"
            )
        print(
            f"[import] candles: --dry-run: {total_rows} row(s) would be upserted; nothing written."
        )
        return 0

    database = get_database(dsn)
    database.bootstrap()
    total_upserted = 0
    with database.connection() as conn, conn.transaction():
        for category, symbol, timeframe, files in series:
            frame = _load(files)
            upserted = _upsert_rows(conn, category, symbol, timeframe, frame)
            total_upserted += upserted
            print(
                f"[import] candles: {category}/{symbol}/{timeframe}: "
                f"{len(files)} file(s), {upserted} row(s) upserted"
            )
    with database.connection() as conn:
        count = conn.execute("SELECT count(*) AS n FROM candles").fetchone()["n"]
    print(f"[import] candles: upserted {total_upserted} row(s); table now has {count} row(s).")
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
