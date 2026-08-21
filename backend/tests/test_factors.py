"""Offline tests for the factor system (preset catalog + whitelist DSL).

Run:
    python tests/test_factors.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from market_data.dlquant import build_features, run_pipeline
from market_data.factors import (
    DEFAULT_FACTORS,
    FactorDef,
    compute_factors,
    evaluate_expr,
    resolve_factors,
)

BASE = 1_700_000_000_000
STEP = 300_000


def _df(n: int = 200, closes=None) -> pd.DataFrame:  # noqa: ANN001
    if closes is None:
        closes = 100 + np.cumsum(np.sin(np.arange(n) / 5))
    closes = np.asarray(closes, dtype="float64")
    return pd.DataFrame({
        "open_time": [BASE + i * STEP for i in range(len(closes))],
        "open": closes, "high": closes + 1.0, "low": closes - 1.0,
        "close": closes, "volume": [1.0] * len(closes),
    })


# -- 4.1 expression evaluator ------------------------------------------------
def test_expression_legal_computes_correctly() -> None:
    df = _df(200)
    s = evaluate_expr("log(close / sma(close, 20))", df)
    expected = np.log(df["close"] / df["close"].rolling(20).mean())
    assert s.iloc[-1] == pytest.approx(expected.iloc[-1])
    assert len(s) == len(df)


def test_expression_deterministic() -> None:
    df = _df(200)
    a = evaluate_expr("rsi(close, 14) / 100 - 0.5", df)
    b = evaluate_expr("rsi(close, 14) / 100 - 0.5", df)
    assert a.equals(b)


def test_expression_rejects_injection() -> None:
    df = _df(200)
    bad = [
        "close.__class__", "import os", "close[0]", "close.close",
        "open(0)", "lambda x: x", "close;pass", "x = 1", "eval('1')",
        "close < 1",
    ]
    for expr in bad:
        try:
            evaluate_expr(expr, df)
        except ValueError:
            continue
        raise AssertionError(f"expression not rejected: {expr!r}")


def test_expression_uses_columns_and_functions() -> None:
    df = _df(200)
    s = evaluate_expr("atr(high, low, close, 14) / close", df)
    assert s.iloc[-1] >= 0.0


# -- 4.2 default snapshot (backward compatibility) --------------------------
def test_default_snapshot_metrics_unchanged() -> None:
    closes = 100 + 5 * np.sin(np.arange(150) / 4)
    df = _df(150, closes=closes)
    r = run_pipeline(df)
    assert abs(r["total_return"] - 0.3430136021573116) < 1e-9
    assert abs(r["max_drawdown"] - 0.0018434927969389703) < 1e-9
    assert abs(r["win_rate"] - 0.9210526315789473) < 1e-9
    assert r["trades"] == 4 and r["bars"] == 39


def test_default_features_columns_and_rows() -> None:
    df = _df(200)
    X, y = build_features(df)
    assert list(X.columns) == [f.id for f in DEFAULT_FACTORS]
    assert len(X) == len(y) and not X.isna().any().any()


# -- 4.3 custom factor sets + series ----------------------------------------
def test_custom_factor_set_only_selected_columns() -> None:
    df = _df(200)
    cfg = [
        {"id": "rsi_14", "name": "RSI14", "kind": "preset", "fn": "rsi", "params": {"period": 14}},
        {"id": "my_alpha", "name": "Alpha", "kind": "expr", "expr": "log(close / sma(close, 20))"},
        {"id": "atr_14", "name": "ATR14", "kind": "preset", "fn": "atr", "params": {"period": 14}},
        {"id": "off", "name": "Off", "kind": "preset", "fn": "rsi", "params": {}, "enabled": False},
    ]
    X, y = build_features(df, cfg)
    assert list(X.columns) == ["rsi_14", "my_alpha", "atr_14"]  # disabled excluded
    assert not X.isna().any().any()


def test_custom_factor_backtest_returns_series() -> None:
    df = _df(250)
    cfg = [
        {"id": "rsi_14", "name": "RSI14", "kind": "preset", "fn": "rsi", "params": {"period": 14}},
        {"id": "mom_10", "name": "Mom", "kind": "preset", "fn": "mom", "params": {"n": 10}},
    ]
    r = run_pipeline(df, factor_defs=cfg)
    assert "total_return" in r and "series" in r and "data_meta" in r
    series = r["series"]
    assert set(series) == {"open_time", "equity", "drawdown", "signal", "proba"}
    n = r["data_meta"]["n_test"]
    assert len(series["open_time"]) == n == len(series["equity"])


def test_series_position_takes_effect_next_bar() -> None:
    """A signal on the last test bar must not contribute equity (no next bar)."""
    df = _df(120)
    from market_data.dlquant import backtest

    X, y = build_features(df)
    test_df = df.loc[X.index].reset_index(drop=True)
    signals = np.zeros(len(test_df))
    signals[-1] = 1.0
    m = backtest(test_df, signals, fee=0.0, slippage=0.0)
    assert abs(m["total_return"]) < 1e-9


def test_factor_params_roundtrip() -> None:
    d = {"id": "rsi_21", "name": "RSI", "kind": "preset", "fn": "rsi",
         "params": {"period": 21}, "enabled": True}
    fd = FactorDef.from_dict(d)
    assert fd.id == "rsi_21" and fd.params == {"period": 21}
    assert FactorDef.from_dict(fd.to_dict()) == fd
    assert resolve_factors([d])[0].id == "rsi_21"
    assert resolve_factors(None) == list(DEFAULT_FACTORS)


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All factor tests passed.")


if __name__ == "__main__":
    _run_all()
