"""PostgreSQL candle-store tests: read trimming/limit, net-new save, delete.

Run:
    cd backend && python -m pytest tests/test_store.py
"""

from __future__ import annotations

import pandas as pd
import pytest

from market_data.db import Database
from market_data.models import OHLCV_COLUMNS, Series
from market_data.store import ParquetStore

DAY = 86_400_000
BASE = 1_700_000_000_000

pytestmark = pytest.mark.db


def _frame(times: list[int], close: float = 1.0) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "open_time": times,
            "open": [close] * len(times),
            "high": [close + 1] * len(times),
            "low": [close - 1] * len(times),
            "close": [close] * len(times),
            "volume": [1.0] * len(times),
        }
    )


def test_read_trims_to_range(pg_db) -> None:  # noqa: ANN001
    store = ParquetStore(pg_db)
    series = Series("USDT-FUTURES", "BTCUSDT", "1d")
    store.save(series, _frame([BASE, BASE + DAY, BASE + 2 * DAY]))
    r = store.read(series, BASE + DAY, BASE + DAY)
    assert [int(t) for t in r["open_time"]] == [BASE + DAY]


def test_read_limit_returns_newest_n_ascending(pg_db) -> None:  # noqa: ANN001
    store = ParquetStore(pg_db)
    series = Series("USDT-FUTURES", "BTCUSDT", "5m")
    for day in range(4):
        times = [BASE + day * DAY + i * 300_000 for i in range(10)]
        store.save(series, _frame(times))
    r = store.read(series, limit=15)
    times = [int(t) for t in r["open_time"]]
    assert len(times) == 15
    assert times == sorted(times)
    assert times[-1] == BASE + 3 * DAY + 9 * 300_000
    assert times[0] == BASE + 2 * DAY + 5 * 300_000


def test_read_limit_respects_range(pg_db) -> None:  # noqa: ANN001
    store = ParquetStore(pg_db)
    series = Series("USDT-FUTURES", "BTCUSDT", "5m")
    times = [BASE + i * 300_000 for i in range(20)]
    store.save(series, _frame(times))
    r = store.read(series, BASE, BASE + 9 * 300_000, limit=5)
    assert [int(t) for t in r["open_time"]] == [BASE + 5 * 300_000 + i * 300_000 for i in range(5)]


def test_read_repeatable_and_uncached_across_connections(pg_db) -> None:  # noqa: ANN001
    store = ParquetStore(pg_db)
    series = Series("USDT-FUTURES", "BTCUSDT", "1d")
    store.save(series, _frame([BASE, BASE + DAY]))
    pd.testing.assert_frame_equal(store.read(series), store.read(series))
    # No in-process cache: a write through a *separate* connection is visible
    # immediately, so a reader can never serve a stale frame. This is the
    # behaviour that replaced the former per-day-file cache.
    writer = Database(pg_db.dsn)
    try:
        ParquetStore(writer).save(series, _frame([BASE + 2 * DAY]))
    finally:
        writer.close()
    assert [int(t) for t in store.read(series)["open_time"]] == [BASE, BASE + DAY, BASE + 2 * DAY]


def test_save_visible_to_subsequent_read(pg_db) -> None:  # noqa: ANN001
    store = ParquetStore(pg_db)
    series = Series("USDT-FUTURES", "BTCUSDT", "1d")
    store.save(series, _frame([BASE]))
    assert len(store.read(series)) == 1
    store.save(series, _frame([BASE + DAY]))
    assert [int(t) for t in store.read(series)["open_time"]] == [BASE, BASE + DAY]


def test_delete_clears_rows(pg_db) -> None:  # noqa: ANN001
    store = ParquetStore(pg_db)
    series = Series("USDT-FUTURES", "BTCUSDT", "1d")
    store.save(series, _frame([BASE]))
    store.delete(series)
    r = store.read(series)
    assert r.empty
    assert r.columns.tolist() == OHLCV_COLUMNS


def test_save_returns_net_new_bars(pg_db) -> None:  # noqa: ANN001
    store = ParquetStore(pg_db)
    series = Series("USDT-FUTURES", "BTCUSDT", "1d")
    assert store.save(series, _frame([BASE, BASE + DAY])) == 2
    assert store.save(series, _frame([BASE, BASE + DAY])) == 0


def test_resave_changed_close_updates_and_returns_zero_new(pg_db) -> None:  # noqa: ANN001
    store = ParquetStore(pg_db)
    series = Series("USDT-FUTURES", "BTCUSDT", "1d")
    store.save(series, _frame([BASE], close=1.0))
    assert store.save(series, _frame([BASE], close=9.0)) == 0
    r = store.read(series)
    assert len(r) == 1
    assert float(r.iloc[0]["close"]) == 9.0


def test_save_dedupes_within_frame_keeping_last(pg_db) -> None:  # noqa: ANN001
    store = ParquetStore(pg_db)
    series = Series("USDT-FUTURES", "BTCUSDT", "1d")
    frame = pd.concat([_frame([BASE]), _frame([BASE], close=2.0)], ignore_index=True)
    assert store.save(series, frame) == 1
    assert float(store.read(series).iloc[0]["close"]) == 2.0


def test_latest_and_earliest_open_time(pg_db) -> None:  # noqa: ANN001
    store = ParquetStore(pg_db)
    series = Series("USDT-FUTURES", "BTCUSDT", "1d")
    store.save(series, _frame([BASE, BASE + DAY, BASE + 2 * DAY]))
    assert store.earliest_open_time(series) == BASE
    assert store.latest_open_time(series) == BASE + 2 * DAY
    assert store.earliest_open_time(Series("USDT-FUTURES", "NOPE", "1h")) is None
    assert store.latest_open_time(Series("USDT-FUTURES", "NOPE", "1h")) is None


def test_empty_read_has_canonical_columns(pg_db) -> None:  # noqa: ANN001
    store = ParquetStore(pg_db)
    r = store.read(Series("USDT-FUTURES", "NOPE", "1h"))
    assert r.empty
    assert r.columns.tolist() == OHLCV_COLUMNS


def test_read_dtypes_match_the_former_parquet_frame(pg_db) -> None:  # noqa: ANN001
    store = ParquetStore(pg_db)
    series = Series("USDT-FUTURES", "BTCUSDT", "1d")
    store.save(series, _frame([BASE, BASE + DAY]))
    r = store.read(series)
    assert r["open_time"].dtype == "int64"
    for col in ("open", "high", "low", "close", "volume"):
        assert r[col].dtype == "float64"
