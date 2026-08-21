"""Offline tests for the DL/ML quant engine.

Run:
    python tests/test_dlquant.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from market_data.dlquant import (
    LogisticRegressionNP,
    backtest,
    build_features,
    run_pipeline,
    signals_from_proba,
    time_split,
    train_predict,
)

BASE = 1_700_000_000_000
STEP = 300_000


def _df(closes) -> pd.DataFrame:
    n = len(closes)
    closes = np.asarray(closes, dtype="float64")
    return pd.DataFrame({
        "open_time": [BASE + i * STEP for i in range(n)],
        "open": closes, "high": closes + 1.0, "low": closes - 1.0,
        "close": closes, "volume": [1.0] * n,
    })


# -- 6.1 features/labels ---------------------------------------------------
def test_features_shapes_and_nolookahead() -> None:
    closes = 100 + np.cumsum(np.sin(np.arange(200) / 5))
    df = _df(closes)
    X, y = build_features(df)
    assert len(X) == len(y) and len(X) > 0
    assert not X.isna().any().any()
    assert set(y.unique()).issubset({0.0, 1.0})
    # label at first feature row must equal direction of the next close.
    i0 = X.index[0]
    expected = 1.0 if df["close"].iloc[i0 + 1] > df["close"].iloc[i0] else 0.0
    assert y.iloc[0] == expected


# -- 6.2 model -------------------------------------------------------------
def test_model_learns_separable() -> None:
    rng = np.random.default_rng(0)
    X = np.vstack([rng.normal(-2, 0.5, (100, 2)), rng.normal(2, 0.5, (100, 2))])
    y = np.array([0.0] * 100 + [1.0] * 100)
    m = LogisticRegressionNP().fit(X, y)
    proba = m.predict_proba(X)
    acc = ((proba > 0.5).astype(float) == y).mean()
    assert acc > 0.9
    assert proba.min() >= 0.0 and proba.max() <= 1.0


def test_model_deterministic() -> None:
    rng = np.random.default_rng(1)
    X = rng.normal(0, 1, (80, 3))
    y = (X[:, 0] > 0).astype(float)
    p1 = LogisticRegressionNP().fit(X, y).predict_proba(X)
    p2 = LogisticRegressionNP().fit(X, y).predict_proba(X)
    assert np.allclose(p1, p2)


# -- 6.3 time split --------------------------------------------------------
def test_time_split_order() -> None:
    tr, te = time_split(100, 0.7)
    assert tr.max() < te.min() and len(tr) == 70 and len(te) == 30


def test_train_predict_no_leak() -> None:
    closes = 100 + np.cumsum(np.sin(np.arange(300) / 7))
    X, y = build_features(_df(closes))
    te, proba = train_predict(X, y, train_ratio=0.7)
    assert len(proba) == len(te)
    assert proba.min() >= 0.0 and proba.max() <= 1.0


# -- 6.4 / 6.5 backtest ----------------------------------------------------
def test_backtest_no_lookahead_and_metrics() -> None:
    closes = np.linspace(100, 120, 50)  # steady uptrend
    df = _df(closes)
    signals = np.ones(len(df))  # always long
    m = backtest(df, signals, fee=0.0, slippage=0.0)
    assert m["total_return"] > 0  # long an uptrend -> profit
    assert {"total_return", "max_drawdown", "win_rate", "trades", "bars"} <= set(m)


def test_backtest_fees_reduce_return() -> None:
    closes = np.linspace(100, 120, 50)
    df = _df(closes)
    # alternate signal to force turnover so fees bite.
    signals = np.array([1.0 if i % 2 == 0 else -1.0 for i in range(len(df))])
    low = backtest(df, signals, fee=0.0, slippage=0.0)["total_return"]
    high = backtest(df, signals, fee=0.01, slippage=0.01)["total_return"]
    assert high <= low


def test_backtest_position_shifted() -> None:
    # A single long signal on the last bar must yield zero pnl (no next bar).
    closes = np.linspace(100, 110, 20)
    df = _df(closes)
    signals = np.zeros(len(df))
    signals[-1] = 1.0
    m = backtest(df, signals, fee=0.0, slippage=0.0)
    assert abs(m["total_return"]) < 1e-9


# -- trade_list ------------------------------------------------------------
def test_trade_list_fields_and_nolookahead() -> None:
    closes = np.linspace(100, 100 + 4 * 5, 8)  # strictly rising closes
    df = _df(closes)
    # long signal on bars 0,1 -> position long on bars 1,2 -> flat again.
    signals = np.array([1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
    m = backtest(df, signals, fee=0.0, slippage=0.0)
    assert len(m["trade_list"]) == 1
    t = m["trade_list"][0]
    assert {"side", "entry_time", "entry_price", "exit_time", "exit_price",
            "bars", "gross_return", "net_return"} <= set(t)
    assert t["side"] == "long"
    # position takes effect on bar 1 -> entry price is close[0], exit close[2].
    assert t["entry_time"] == int(df["open_time"].iloc[0])
    assert t["entry_price"] == round(float(df["close"].iloc[0]), 8)
    assert t["exit_time"] == int(df["open_time"].iloc[2])
    assert t["exit_price"] == round(float(df["close"].iloc[2]), 8)
    assert t["bars"] == 2
    # strictly rising closes with zero costs -> strictly positive return.
    assert t["gross_return"] > 0 and t["net_return"] > 0


def test_trade_list_empty_when_flat() -> None:
    closes = np.linspace(100, 120, 50)
    df = _df(closes)
    m = backtest(df, np.zeros(len(df)))
    assert m["trade_list"] == []
    assert m["total_return"] == 0.0 and m["trades"] == 0


def test_trade_list_flip_charges_two_sides() -> None:
    # Alternating 1/-1 signals flip position every bar; every trade after the
    # first is a direct sign flip (entry_time == previous exit_time) and must
    # pay entry+exit cost (2 * (fee+slippage)).
    closes = np.linspace(100, 120, 40)
    df = _df(closes)
    signals = np.array([1.0 if i % 2 == 0 else -1.0 for i in range(len(df))])
    cost = 0.0004 + 0.0005
    m = backtest(df, signals, fee=0.0004, slippage=0.0005)
    flips = [t for t, prev in zip(m["trade_list"][1:], m["trade_list"])
             if t["entry_time"] == prev["exit_time"]]
    assert len(flips) > 0
    for t in flips:
        # single-bar flip trade: net = gross - 2*cost exactly (modulo rounding).
        assert abs(t["net_return"] - (t["gross_return"] - 2 * cost)) < 1e-6


def test_trade_list_reconstructs_equity() -> None:
    """Compounding trade net_returns must reproduce total_return exactly."""
    for seed in range(5):
        rng = np.random.default_rng(seed)
        closes = 100 * np.exp(np.cumsum(rng.normal(0, 0.01, 200)))
        df = _df(closes)
        signals = ((np.arange(len(closes)) % 5 == 0).astype(float)
                   - (np.arange(len(closes)) % 5 == 1).astype(float))
        m = backtest(df, signals, fee=0.0004, slippage=0.0005)
        reconstructed = 1.0
        for t in m["trade_list"]:
            reconstructed *= 1.0 + t["net_return"]
        assert abs(reconstructed - 1.0 - m["total_return"]) < 1e-5


def test_run_pipeline_default_snapshot() -> None:
    """Default 7-factor run keeps scalar metrics identical to pre-change."""
    closes = 100 + np.cumsum(np.sin(np.arange(300) / 7))
    df = _df(closes)
    m = run_pipeline(df)
    assert abs(m["total_return"] - 0.60278879) < 1e-6
    assert abs(m["max_drawdown"] - 0.00167285) < 1e-6
    assert abs(m["win_rate"] - 0.90361446) < 1e-6
    assert m["trades"] == 7
    assert m["bars"] == 84 and m["test_bars"] == 84
    assert m["data_meta"] == {
        "n_train": 196, "n_test": 84,
        "start": 1700064500000, "end": 1700089400000,
    }
    assert len(m["trade_list"]) == 5
    assert len(m["series"]["equity"]) == m["test_bars"]


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All dlquant tests passed.")


if __name__ == "__main__":
    _run_all()
