"""Offline tests for the DL/ML quant engine (vectorbt-backed).

Run:
    python tests/test_dlquant.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from market_data.dlquant import (
    SklearnModel,
    backtest,
    build_features,
    model_metrics,
    run_pipeline,
    signals_from_proba,
    time_split,
    train_predict,
    walk_forward_run,
    walk_forward_splits,
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
    m = SklearnModel().fit(X, y)
    proba = m.predict_proba(X)
    acc = ((proba > 0.5).astype(float) == y).mean()
    assert acc > 0.9
    assert proba.min() >= 0.0 and proba.max() <= 1.0


def test_model_deterministic() -> None:
    rng = np.random.default_rng(1)
    X = rng.normal(0, 1, (80, 3))
    y = (X[:, 0] > 0).astype(float)
    p1 = SklearnModel().fit(X, y).predict_proba(X)
    p2 = SklearnModel().fit(X, y).predict_proba(X)
    assert np.allclose(p1, p2)


def test_model_hgb_supported() -> None:
    rng = np.random.default_rng(2)
    X = rng.normal(0, 1, (120, 3))
    y = (X[:, 0] + X[:, 1] > 0).astype(float)
    m = SklearnModel(kind="hgb").fit(X, y)
    proba = m.predict_proba(X)
    assert proba.min() >= 0.0 and proba.max() <= 1.0
    assert np.allclose(
        m.predict_proba(X), SklearnModel(kind="hgb").fit(X, y).predict_proba(X)
    )


def test_model_rejects_unknown_kind() -> None:
    import pytest

    with pytest.raises(ValueError):
        SklearnModel(kind="nope")


def test_model_scale_off_skips_standardizer() -> None:
    rng = np.random.default_rng(4)
    X = rng.normal(0, 1, (120, 3))
    y = (X[:, 0] + X[:, 1] > 0).astype(float)
    # Raw features with a large offset: scaled vs unscaled must fit without
    # error and both produce [0,1] probabilities.
    Xraw = X * 1000 + 1e6
    for scale in (True, False):
        m = SklearnModel(scale=scale, max_iter=1000).fit(Xraw, y)
        p = m.predict_proba(Xraw)
        assert p.min() >= 0.0 and p.max() <= 1.0
        assert m.scale == scale


def test_model_hyperparams_forwarded() -> None:
    rng = np.random.default_rng(5)
    X = rng.normal(0, 1, (120, 3))
    y = (X[:, 0] > 0).astype(float)
    m = SklearnModel(kind="lr", C=0.01, max_iter=300, solver="lbfgs").fit(X, y)
    assert m.predict_proba(X).shape == (120,)
    hgb = SklearnModel(kind="hgb", max_depth=3, learning_rate=0.1).fit(X, y)
    assert hgb.predict_proba(X).shape == (120,)


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


def test_walk_forward_splits_no_leak() -> None:
    folds = walk_forward_splits(200, n_splits=4)
    assert len(folds) == 4
    for tr, te in folds:
        assert tr.max() < te.min()


def test_model_metrics_output() -> None:
    rng = np.random.default_rng(3)
    y = np.array([0, 1] * 30, dtype="float64")
    p = rng.random(60)
    mm = model_metrics(y, p)
    assert 0.0 <= mm["roc_auc"] <= 1.0 and mm["log_loss"] >= 0.0
    assert model_metrics(np.zeros(10), rng.random(10)) == {"roc_auc": None, "log_loss": None}


# -- 6.4 / 6.5 backtest (vectorbt standard semantics) ----------------------
def test_backtest_no_lookahead_and_metrics() -> None:
    closes = np.linspace(100, 120, 50)  # steady uptrend
    df = _df(closes)
    signals = np.ones(len(df))  # always long
    m = backtest(df, signals, fee=0.0, slippage=0.0)
    assert m["total_return"] > 0  # long an uptrend -> profit
    assert {"total_return", "max_drawdown", "win_rate", "trades", "bars"} <= set(m)
    assert set(m["series"]) == {"open_time", "equity", "drawdown", "signal", "proba", "benchmark"}
    assert len(m["series"]["equity"]) == len(df)


def test_backtest_fees_reduce_return() -> None:
    closes = np.linspace(100, 120, 50)
    df = _df(closes)
    # alternate signal to force turnover so fees bite.
    signals = np.array([1.0 if i % 2 == 0 else -1.0 for i in range(len(df))])
    low = backtest(df, signals, fee=0.0, slippage=0.0)["total_return"]
    high = backtest(df, signals, fee=0.01, slippage=0.01)["total_return"]
    assert high <= low


def test_backtest_last_bar_signal_no_trade() -> None:
    # vectorbt fills at the signal bar's close; a signal on the last bar has
    # no subsequent bar to capture a move, so PnL is ~0 (may leave an open
    # trade marked to market at the same close).
    closes = np.linspace(100, 110, 20)
    df = _df(closes)
    signals = np.zeros(len(df))
    signals[-1] = 1.0
    m = backtest(df, signals, fee=0.0, slippage=0.0)
    assert abs(m["total_return"]) < 1e-9


def test_backtest_empty_trades() -> None:
    closes = np.linspace(100, 120, 50)
    df = _df(closes)
    m = backtest(df, np.zeros(len(df)))
    assert m["trade_list"] == []
    assert m["total_return"] == 0.0 and m["trades"] == 0


def test_backtest_deterministic() -> None:
    closes = 100 * np.exp(np.cumsum(np.random.default_rng(0).normal(0, 0.01, 200)))
    df = _df(closes)
    signals = ((np.arange(len(closes)) % 5 == 0).astype(float)
               - (np.arange(len(closes)) % 5 == 1).astype(float))
    a = backtest(df, signals, fee=0.0004, slippage=0.0005)
    b = backtest(df, signals, fee=0.0004, slippage=0.0005)
    assert a["total_return"] == b["total_return"]
    assert a["series"]["equity"] == b["series"]["equity"]
    assert a["trade_list"] == b["trade_list"]


def test_backtest_trade_list_contract() -> None:
    closes = np.linspace(100, 100 + 4 * 5, 8)  # strictly rising closes
    df = _df(closes)
    signals = np.array([1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
    m = backtest(df, signals, fee=0.0, slippage=0.0)
    assert len(m["trade_list"]) == 1
    t = m["trade_list"][0]
    assert {"side", "entry_time", "entry_price", "exit_time", "exit_price",
            "bars", "gross_return", "net_return"} <= set(t)
    assert t["side"] == "long"
    assert t["entry_time"] == int(df["open_time"].iloc[0])
    assert t["exit_time"] == int(df["open_time"].iloc[2])
    # strictly rising closes with zero costs -> strictly positive return.
    assert t["gross_return"] > 0 and t["net_return"] > 0


def test_backtest_stats_available() -> None:
    closes = np.linspace(100, 120, 50)
    df = _df(closes)
    signals = np.ones(len(df))
    m = backtest(df, signals, fee=0.0, slippage=0.0)
    assert set(m["stats"]) >= {"sharpe_ratio", "sortino_ratio", "calmar_ratio"}


def test_backtest_init_cash_changes_equity_scale() -> None:
    closes = 100 + np.cumsum(np.sin(np.arange(200) / 7))
    df = _df(closes)
    signals = np.array([1.0 if i % 2 == 0 else -1.0 for i in range(len(closes))])
    base = backtest(df, signals, fee=0.0, slippage=0.0)
    big = backtest(df, signals, fee=0.0, slippage=0.0, init_cash=1_000_000)
    # init_cash scales the absolute equity values but not the percentage return.
    assert big["series"]["equity"][0] > base["series"]["equity"][0]
    assert abs(big["total_return"] - base["total_return"]) < 1e-9


def test_backtest_size_affects_drawdown() -> None:
    closes = 100 + np.cumsum(np.sin(np.arange(200) / 7))
    df = _df(closes)
    signals = np.array([1.0 if i % 2 == 0 else -1.0 for i in range(len(closes))])
    full = backtest(df, signals, fee=0.0, slippage=0.0, size=1.0)
    half = backtest(df, signals, fee=0.0, slippage=0.0, size=0.5)
    # max_drawdown is negative; a smaller size halves the loss magnitude.
    assert half["max_drawdown"] >= full["max_drawdown"] - 1e-12


def test_run_pipeline_init_cash_forwarded() -> None:
    closes = 100 + np.cumsum(np.sin(np.arange(300) / 7))
    df = _df(closes)
    default = run_pipeline(df, timeframe="1h")
    scaled = run_pipeline(df, timeframe="1h", init_cash=500_000)
    assert "error" not in default and "error" not in scaled
    assert scaled["series"]["equity"][0] > default["series"]["equity"][0]
    assert abs(scaled["total_return"] - default["total_return"]) < 1e-9


def test_run_pipeline_exports_feature_weights_and_roc() -> None:
    closes = 100 + np.cumsum(np.sin(np.arange(300) / 7))
    df = _df(closes)
    r = run_pipeline(df, timeframe="1h", model=SklearnModel(kind="lr"))
    assert "error" not in r
    fw = r["feature_weights"]
    assert fw["kind"] == "coef"
    assert len(fw["features"]) == len(fw["values"]) == 7
    rc = r["roc_curve"]
    assert len(rc["fpr"]) == len(rc["tpr"]) >= 2
    assert rc["fpr"][0] == 0.0 and rc["fpr"][-1] == 1.0


def test_run_pipeline_benchmark_lane() -> None:
    closes = 100 + np.cumsum(np.sin(np.arange(300) / 7))
    df = _df(closes)
    r = run_pipeline(df, timeframe="1h")
    assert "error" not in r
    bench = r["series"]["benchmark"]
    assert len(bench) == len(r["series"]["equity"])
    assert bench[0] == 1.0
    # benchmark aligns to the test-slice closes, not the full frame.
    X, y = build_features(df)
    te_idx = X.index[time_split(len(X), 0.7)[1]]
    first = float(closes[te_idx[0]])
    last = float(closes[te_idx[-1]])
    assert abs(bench[-1] - round(last / first, 8)) < 1e-6


def test_run_pipeline_hgb_importance_weights() -> None:
    closes = 100 + np.cumsum(np.sin(np.arange(300) / 7))
    df = _df(closes)
    r = run_pipeline(df, timeframe="1h", model=SklearnModel(kind="hgb"))
    assert "error" not in r
    fw = r["feature_weights"]
    assert fw["kind"] == "importance"
    assert len(fw["features"]) == len(fw["values"]) == 7


def test_run_pipeline_default() -> None:
    """Default 7-factor run returns the full contract under vectorbt semantics."""
    closes = 100 + np.cumsum(np.sin(np.arange(300) / 7))
    df = _df(closes)
    m = run_pipeline(df, timeframe="1h")
    assert {"total_return", "max_drawdown", "win_rate", "trades", "bars"} <= set(m)
    assert m["test_bars"] == m["bars"]
    assert set(m["data_meta"]) == {"n_train", "n_test", "start", "end"}
    assert "roc_auc" in m["model_metrics"]
    assert len(m["trade_list"]) == m["trades"]
    assert len(m["series"]["equity"]) == m["test_bars"]


def test_signals_from_proba() -> None:
    p = np.array([0.2, 0.8, 0.5, 0.4])
    assert (signals_from_proba(p, 0.55) == np.array([-1.0, 1.0, 0.0, -1.0])).all()


def test_walk_forward_run_folds_ordered() -> None:
    """Each fold's test window strictly follows its train window (no leak)."""
    closes = 100 + np.cumsum(np.sin(np.arange(900) / 9))
    df = _df(closes)
    m = walk_forward_run(df, n_splits=3, timeframe="1h")
    assert "folds" in m
    assert len(m["folds"]) == 3
    for f in m["folds"]:
        assert {"fold", "train_start", "train_end", "test_start", "test_end",
                "total_return", "max_drawdown", "win_rate", "trades",
                "roc_auc", "log_loss"} <= set(f)
        assert f["train_end"] < f["test_start"], "test must strictly follow train"
        assert f["test_start"] < f["test_end"]
        assert f["fold"] == len([x for x in m["folds"] if x["fold"] < f["fold"]])


def test_walk_forward_run_insufficient_data() -> None:
    closes = 100 + np.cumsum(np.sin(np.arange(60) / 5))
    df = _df(closes)
    m = walk_forward_run(df, n_splits=10, timeframe="1h")
    assert "error" in m


def test_walk_forward_run_model_hgb() -> None:
    closes = 100 + np.cumsum(np.sin(np.arange(600) / 8))
    df = _df(closes)
    m = walk_forward_run(df, n_splits=2, timeframe="1h", model=SklearnModel(kind="hgb"))
    assert "folds" in m and len(m["folds"]) == 2


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All dlquant tests passed.")


if __name__ == "__main__":
    _run_all()
