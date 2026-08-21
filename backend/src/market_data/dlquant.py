"""DL/ML quant engine (5m): features -> model -> signals -> backtest.

Dependency-light and Python-3.14-safe: a numpy logistic-regression baseline
behind a pluggable `Model` interface (torch/sklearn can slot in later). No
look-ahead: labels are shifted forward, features use only past/current bars,
and backtest positions take effect on the next bar.
"""

from __future__ import annotations

from typing import Protocol

import numpy as np
import pandas as pd

from market_data.factors import FEATURE_COLUMNS, compute_factors


# -- 1. features -----------------------------------------------------------
def build_features(
    df: pd.DataFrame, factor_defs: list | None = None
) -> tuple[pd.DataFrame, pd.Series]:
    """Return (X, y). y[t] = 1 if close[t+1] > close[t] else 0 (no look-ahead).

    ``factor_defs=None`` uses the default 7-factor set (backward compatible);
    otherwise it must be a list of factor definitions (preset/expr dicts).
    """
    feats = compute_factors(df, factor_defs)
    close = df["close"]
    label = (close.shift(-1) > close).astype("float64")  # next-bar direction
    label.iloc[-1] = np.nan  # last row has no future -> drop

    data = feats.assign(_y=label).dropna()
    X = data[list(feats.columns)]
    y = data["_y"]
    return X, y


# -- 2. model --------------------------------------------------------------
class Model(Protocol):
    def fit(self, X: np.ndarray, y: np.ndarray) -> "Model": ...
    def predict_proba(self, X: np.ndarray) -> np.ndarray: ...


class LogisticRegressionNP:
    """Deterministic numpy logistic regression with train-set standardization."""

    def __init__(self, lr: float = 0.1, n_iter: int = 2000, l2: float = 1e-4) -> None:
        self.lr = lr
        self.n_iter = n_iter
        self.l2 = l2
        self._w: np.ndarray | None = None
        self._b = 0.0
        self._mu: np.ndarray | None = None
        self._sd: np.ndarray | None = None

    @staticmethod
    def _sigmoid(z: np.ndarray) -> np.ndarray:
        return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))

    def _standardize(self, X: np.ndarray, fit: bool) -> np.ndarray:
        if fit:
            self._mu = X.mean(axis=0)
            self._sd = X.std(axis=0)
            self._sd[self._sd == 0] = 1.0
        return (X - self._mu) / self._sd

    def fit(self, X: np.ndarray, y: np.ndarray) -> "LogisticRegressionNP":
        Xs = self._standardize(np.asarray(X, dtype="float64"), fit=True)
        y = np.asarray(y, dtype="float64")
        n, d = Xs.shape
        self._w = np.zeros(d)
        self._b = 0.0
        for _ in range(self.n_iter):
            p = self._sigmoid(Xs @ self._w + self._b)
            err = p - y
            self._w -= self.lr * (Xs.T @ err / n + self.l2 * self._w)
            self._b -= self.lr * err.mean()
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        Xs = self._standardize(np.asarray(X, dtype="float64"), fit=False)
        return self._sigmoid(Xs @ self._w + self._b)


# -- 3. time split ---------------------------------------------------------
def time_split(n: int, train_ratio: float = 0.7) -> tuple[np.ndarray, np.ndarray]:
    cut = int(n * train_ratio)
    return np.arange(cut), np.arange(cut, n)


def train_predict(
    X: pd.DataFrame, y: pd.Series, model: Model | None = None, train_ratio: float = 0.7
) -> tuple[np.ndarray, np.ndarray]:
    """Fit on the earlier part, predict proba on the later part.

    Returns (test_index_positions, proba_on_test).
    """
    model = model or LogisticRegressionNP()
    tr, te = time_split(len(X), train_ratio)
    model.fit(X.iloc[tr].to_numpy(), y.iloc[tr].to_numpy())
    proba = model.predict_proba(X.iloc[te].to_numpy())
    return te, proba


# -- 4. signals + backtest -------------------------------------------------
def signals_from_proba(proba: np.ndarray, thresh: float = 0.55) -> np.ndarray:
    sig = np.zeros(len(proba))
    sig[proba >= thresh] = 1.0
    sig[proba <= (1 - thresh)] = -1.0
    return sig


def _extract_trades(
    times: pd.Series,
    close: pd.Series,
    position: pd.Series,
    pct: pd.Series,
    net: pd.Series,
) -> list[dict]:
    """Split the position series into per-trade records.

    A trade is a contiguous run of non-zero position with constant sign.
    ``position[i]`` takes effect on bar i (signal[i-1]), so entry/exit prices
    come from the bar before the position change. A direct sign flip closes the
    old trade and opens a new one, charging fee+slippage on each side (the
    vectorized ``turnover`` counts 2 units on a flip bar). A trade still open
    at the last bar is marked-to-market with no exit cost.

    ``net`` is the per-bar PnL already net of costs, so the trade's
    ``net_return`` is the exact product of its bars' factors (including the
    exit-to-flat cost bar) — compounding trade net_returns reconstructs the
    returned equity curve exactly.
    """
    trades: list[dict] = []
    n = len(position)
    i = 0
    while i < n:
        if position.iloc[i] == 0:
            i += 1
            continue
        side = "long" if position.iloc[i] > 0 else "short"
        e = i
        x = e
        while x < n and position.iloc[x] != 0 and (position.iloc[x] > 0) == (position.iloc[e] > 0):
            x += 1
        gross = 1.0
        factor = 1.0
        for j in range(e, x):
            gross *= 1.0 + position.iloc[j] * pct.iloc[j]
            factor *= 1.0 + net.iloc[j]
        if x < n and position.iloc[x] == 0:  # exit-to-flat bar carries the exit cost factor
            factor *= 1.0 + net.iloc[x]
        trades.append({
            "side": side,
            "entry_time": int(times[e - 1]),
            "entry_price": round(float(close.iloc[e - 1]), 8),
            "exit_time": int(times[x - 1]),
            "exit_price": round(float(close.iloc[x - 1]), 8),
            "bars": x - e,
            "gross_return": round(gross - 1.0, 8),
            "net_return": round(factor - 1.0, 8),
        })
        i = x
    return trades


def backtest(
    df: pd.DataFrame,
    signals: np.ndarray,
    fee: float = 0.0004,
    slippage: float = 0.0005,
    proba: np.ndarray | None = None,
) -> dict:
    """Vectorized backtest. `signals[i]` aligns to df row i; position takes
    effect on the next bar (shift(1)) to avoid look-ahead.

    Returns the scalar metrics dict plus a ``series`` key carrying per-bar
    open_time / equity / drawdown / signal / proba aligned to df rows, and a
    ``trade_list`` key with per-trade records (side / times / prices / returns).
    The scalar ``trades`` count is preserved.
    """
    close = df["close"].reset_index(drop=True)
    times = df["open_time"].reset_index(drop=True)
    sig = pd.Series(signals, index=close.index).reindex(close.index).fillna(0.0)
    position = sig.shift(1).fillna(0.0)
    pct = close.pct_change().fillna(0.0)
    gross = position * pct
    turnover = position.diff().abs().fillna(position.abs())
    cost = turnover * (fee + slippage)
    net = gross - cost

    equity = (1.0 + net).cumprod()
    drawdown = equity / equity.cummax() - 1.0
    trades = int((position.diff().fillna(position).abs() > 0).sum())
    wins = int((net[net != 0] > 0).sum())
    active = int((net != 0).sum())
    peak = equity.cummax()
    max_dd = float(((peak - equity) / peak).max()) if len(equity) else 0.0

    metrics = {
        "total_return": float(equity.iloc[-1] - 1.0) if len(equity) else 0.0,
        "max_drawdown": max_dd,
        "win_rate": (wins / active) if active else 0.0,
        "trades": trades,
        "bars": int(len(close)),
    }
    metrics["series"] = {
        "open_time": [int(t) for t in df["open_time"].tolist()],
        "equity": [round(float(v), 8) for v in equity.tolist()],
        "drawdown": [round(float(v), 8) for v in drawdown.tolist()],
        "signal": [round(float(v), 8) for v in sig.tolist()],
        "proba": [round(float(p), 8) for p in proba] if proba is not None else [],
    }
    metrics["trade_list"] = _extract_trades(times, close, position, pct, net)
    return metrics


# -- 5. pipeline -----------------------------------------------------------
def run_pipeline(
    df: pd.DataFrame,
    model: Model | None = None,
    train_ratio: float = 0.7,
    thresh: float = 0.55,
    fee: float = 0.0004,
    slippage: float = 0.0005,
    factor_defs: list | None = None,
) -> dict:
    X, y = build_features(df, factor_defs)
    if len(X) < 50:
        return {"error": f"insufficient data after features (rows={len(X)})"}
    te, proba = train_predict(X, y, model, train_ratio)
    signals = signals_from_proba(proba, thresh)
    # Map test signals back onto the test slice of the original frame.
    test_df = df.loc[X.index[te]].reset_index(drop=True)
    result = backtest(test_df, signals, fee, slippage, proba)
    result["test_bars"] = int(len(te))
    result["data_meta"] = {
        "n_train": int(len(X) - len(te)),
        "n_test": int(len(te)),
        "start": int(test_df["open_time"].iloc[0]),
        "end": int(test_df["open_time"].iloc[-1]),
    }
    return result
