"""Offline tests for ChartStore persistence (PostgreSQL).

Run:
    pytest tests/test_chartstore.py
"""

from __future__ import annotations

import threading

import pytest

from market_data.chartstore import MAX_DRAWINGS_PER_SERIES, ChartStore

pytestmark = pytest.mark.db

KEY = ("USDT-FUTURES", "BTCUSDT", "5m")


def _valid_state() -> dict:
    return {
        "indicators": [
            {"name": "MACD", "pane": "sub"},
            {"name": "MA", "pane": "candle"},
        ],
        "drawings": [
            {"id": "d1", "name": "segment", "points": [{"timestamp": 1, "value": 100}]},
        ],
        "layers": {"sr": True, "structure": True, "smc": False},
    }


def test_roundtrip(pg_db) -> None:  # noqa: ANN001
    s = ChartStore(pg_db)
    saved = s.save(*KEY, _valid_state())
    assert saved["indicators"][0]["name"] == "MACD"
    assert s.get(*KEY) == _valid_state()


def test_missing_series_returns_empty_template(pg_db) -> None:  # noqa: ANN001
    s = ChartStore(pg_db)
    state = s.get(*KEY)
    assert state["indicators"] == []
    assert state["drawings"] == []
    assert state["layers"]["sr"] is True


def test_series_isolation(pg_db) -> None:  # noqa: ANN001
    s = ChartStore(pg_db)
    s.save(*KEY, _valid_state())
    other = s.get("USDT-FUTURES", "ETHUSDT", "5m")
    assert other["drawings"] == []


def test_key_is_not_normalized(pg_db) -> None:  # noqa: ANN001
    s = ChartStore(pg_db)
    s.save("USDT-FUTURES", "BTCUSDT", "1H", _valid_state())
    assert s.get("USDT-FUTURES", "BTCUSDT", "1h")["indicators"] == []
    assert s.get("USDT-FUTURES", "BTCUSDT", "1H")["indicators"][0]["name"] == "MACD"


def test_persists_across_instances(pg_db) -> None:  # noqa: ANN001
    ChartStore(pg_db).save(*KEY, _valid_state())
    assert ChartStore(pg_db).get(*KEY)["indicators"][0]["name"] == "MACD"


def test_load_returns_all_series(pg_db) -> None:  # noqa: ANN001
    s = ChartStore(pg_db)
    s.save(*KEY, _valid_state())
    s.save("SPOT", "ETHUSDT", "1d", _valid_state())
    loaded = s.load()
    assert set(loaded) == {"USDT-FUTURES/BTCUSDT/5m", "SPOT/ETHUSDT/1d"}


def test_invalid_shape_rejected(pg_db) -> None:  # noqa: ANN001
    s = ChartStore(pg_db)
    with pytest.raises(ValueError):
        s.save(*KEY, {"indicators": "nope", "drawings": [], "layers": {}})


def test_invalid_pane_rejected(pg_db) -> None:  # noqa: ANN001
    s = ChartStore(pg_db)
    bad = _valid_state()
    bad["indicators"] = [{"name": "MACD", "pane": "sideways"}]
    with pytest.raises(ValueError):
        s.save(*KEY, bad)


def test_oversized_drawings_rejected(pg_db) -> None:  # noqa: ANN001
    s = ChartStore(pg_db)
    bad = _valid_state()
    bad["drawings"] = [
        {"name": "segment", "points": []} for _ in range(MAX_DRAWINGS_PER_SERIES + 1)
    ]
    with pytest.raises(ValueError):
        s.save(*KEY, bad)


def test_concurrent_writes_to_different_series_do_not_clobber(pg_db) -> None:  # noqa: ANN001
    """The old JSON store lost updates; per-row upserts must not."""
    state = _valid_state()

    def _write(index: int) -> None:
        ChartStore(pg_db).save("USDT-FUTURES", f"SYM{index}", "5m", state)

    threads = [threading.Thread(target=_write, args=(i,)) for i in range(16)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    loaded = ChartStore(pg_db).load()
    assert len(loaded) == 16
    assert all(f"USDT-FUTURES/SYM{i}/5m" in loaded for i in range(16))


if __name__ == "__main__":
    import sys

    sys.exit(pytest.main([__file__, "-v"]))
