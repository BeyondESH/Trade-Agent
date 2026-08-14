"""Offline tests for ChartStore persistence.

Run:
    python tests/test_chartstore.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import tempfile

import pytest

from market_data.chartstore import ChartStore, MAX_DRAWINGS_PER_SERIES

KEY = ("USDT-FUTURES", "BTCUSDT", "5m")


def _store(tmp) -> ChartStore:  # noqa: ANN001
    return ChartStore(tmp / "config" / "chart.json")


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


def test_roundtrip() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        s = _store(__import__("pathlib").Path(tmp))
        saved = s.save(*KEY, _valid_state())
        assert saved["indicators"][0]["name"] == "MACD"
        assert s.get(*KEY) == _valid_state()


def test_missing_series_returns_empty_template() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        s = _store(__import__("pathlib").Path(tmp))
        state = s.get(*KEY)
        assert state["indicators"] == []
        assert state["drawings"] == []
        assert state["layers"]["sr"] is True


def test_series_isolation() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        s = _store(__import__("pathlib").Path(tmp))
        s.save(*KEY, _valid_state())
        other = s.get("USDT-FUTURES", "ETHUSDT", "5m")
        assert other["drawings"] == []


def test_persists_across_instances() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        path = __import__("pathlib").Path(tmp) / "config" / "chart.json"
        ChartStore(path).save(*KEY, _valid_state())
        assert ChartStore(path).get(*KEY)["indicators"][0]["name"] == "MACD"


def test_invalid_shape_rejected() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        s = _store(__import__("pathlib").Path(tmp))
        with pytest.raises(ValueError):
            s.save(*KEY, {"indicators": "nope", "drawings": [], "layers": {}})


def test_invalid_pane_rejected() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        s = _store(__import__("pathlib").Path(tmp))
        bad = _valid_state()
        bad["indicators"] = [{"name": "MACD", "pane": "sideways"}]
        with pytest.raises(ValueError):
            s.save(*KEY, bad)


def test_oversized_drawings_rejected() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        s = _store(__import__("pathlib").Path(tmp))
        bad = _valid_state()
        bad["drawings"] = [
            {"name": "segment", "points": []} for _ in range(MAX_DRAWINGS_PER_SERIES + 1)
        ]
        with pytest.raises(ValueError):
            s.save(*KEY, bad)


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All chartstore tests passed.")


if __name__ == "__main__":
    _run_all()
