"""Offline tests for ParquetStore read optimizations (trim, limit, cache).

Run:
    python tests/test_store.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pandas as pd

from market_data.models import Series
from market_data.store import ParquetStore

DAY = 86_400_000
BASE = 1_700_000_000_000


def _frame(times: list, close: float = 1.0) -> pd.DataFrame:
    return pd.DataFrame({
        "open_time": times,
        "open": [close] * len(times),
        "high": [close + 1] * len(times),
        "low": [close - 1] * len(times),
        "close": [close] * len(times),
        "volume": [1.0] * len(times),
    })


def _store(tmp: str) -> ParquetStore:
    return ParquetStore(Path(tmp))


def test_read_trims_to_day_range() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = _store(tmp)
        series = Series("USDT-FUTURES", "BTCUSDT", "1d")
        store.save(series, _frame([BASE, BASE + DAY, BASE + 2 * DAY]))
        r = store.read(series, BASE + DAY, BASE + DAY)
        assert [int(t) for t in r["open_time"]] == [BASE + DAY]
        # only the in-range day file was read into the cache
        assert len(store._file_cache) == 1


def test_read_limit_reverse_accumulates() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = _store(tmp)
        series = Series("USDT-FUTURES", "BTCUSDT", "5m")
        # 4 day files x 10 bars
        for day in range(4):
            times = [BASE + day * DAY + i * 300_000 for i in range(10)]
            store.save(series, _frame(times))
        r = store.read(series, limit=15)
        times = [int(t) for t in r["open_time"]]
        assert len(times) == 15
        assert times == sorted(times)
        assert times[-1] == BASE + 3 * DAY + 9 * 300_000  # newest bar
        assert times[0] == BASE + 2 * DAY + 5 * 300_000  # last 15 of 40
        # reverse accumulation stopped after the 2 newest files (10+10 >= 15)
        assert len(store._file_cache) == 2


def test_read_cache_hit_avoids_disk() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = _store(tmp)
        series = Series("USDT-FUTURES", "BTCUSDT", "1d")
        store.save(series, _frame([BASE, BASE + DAY]))
        store.read(series)  # warm the cache
        reads = {"n": 0}
        orig = store._read_file

        def counting_read(path):  # noqa: ANN001
            reads["n"] += 1
            return orig(path)

        store._read_file = counting_read
        store.read(series)
        store.read(series, BASE, BASE)
        assert reads["n"] == 0  # served entirely from the file cache


def test_save_invalidates_cache() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = _store(tmp)
        series = Series("USDT-FUTURES", "BTCUSDT", "1d")
        store.save(series, _frame([BASE]))
        store.read(series)  # cache the day file
        store.save(series, _frame([BASE + DAY]))  # new day file + invalidate
        r = store.read(series)
        assert sorted(int(t) for t in r["open_time"]) == [BASE, BASE + DAY]


def test_delete_invalidates_cache() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = _store(tmp)
        series = Series("USDT-FUTURES", "BTCUSDT", "1d")
        store.save(series, _frame([BASE]))
        store.read(series)  # cache the day file
        store.delete(series)
        assert store.read(series).empty
        assert store._file_cache == {}
