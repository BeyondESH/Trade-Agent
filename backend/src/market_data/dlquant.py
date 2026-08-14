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

from market_data import indicators

FEATURE_COLUMNS = [
    "log_ret",
    "macd_hist",
    "kdj_j",
    "boll_pos",
    "vegas_dist",
    "roll_mean_5",
    "roll_std_5",
]


# -- 1. features -----------------------------------------------------------
def build_features(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """Return (X, y). y[t] = 1 if close[t+1] > close[t] else 0 (no look-ahead)."""
    ind = indicators.compute(df)
    close = ind["close"]
    feats = pd.DataFrame(index=ind.index)
    feats["log_ret"] = np.log(close / close.shift(1))
    feats["macd_hist"] = ind["macd_hist"]
    feats["kdj_j"] = ind["kdj_j"]
    boll_width = (ind["boll_upper"] - ind["boll_lower"]).replace(0, np.nan)
    feats["boll_pos"] = (close - ind["boll_mid"]) / boll_width
    feats["vegas_dist"] = (close - ind["vegas_ema144"]) / close
    feats["roll_mean_5"] = feats["log_ret"].rolling(5).mean()
    feats["roll_std_5"] = feats["log_ret"].rolling(5).std()

    label = (close.shift(-1) > close).astype("float64")  # next-bar direction
    label.iloc[-1] = np.nan  # last row has no future -> drop

    data = feats.assign(_y=label).dropna()
    X = data[FEATURE_COLUMNS]
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


def backtest(
    df: pd.DataFrame,
    signals: np.ndarray,
    fee: float = 0.0004,
    slippage: float = 0.0005,
) -> dict:
    """Vectorized backtest. `signals[i]` aligns to df row i; position takes
    effect on the next bar (shift(1)) to avoid look-ahead."""
    close = df["close"].reset_index(drop=True)
    sig = pd.Series(signals, index=close.index).reindex(close.index).fillna(0.0)
    position = sig.shift(1).fillna(0.0)
    pct = close.pct_change().fillna(0.0)
    gross = position * pct
    turnover = position.diff().abs().fillna(position.abs())
    cost = turnover * (fee + slippage)
    net = gross - cost

    equity = (1.0 + net).cumprod()
    trades = int((position.diff().fillna(position).abs() > 0).sum())
    wins = int((net[net != 0] > 0).sum())
    active = int((net != 0).sum())
    peak = equity.cummax()
    max_dd = float(((peak - equity) / peak).max()) if len(equity) else 0.0

    return {
        "total_return": float(equity.iloc[-1] - 1.0) if len(equity) else 0.0,
        "max_drawdown": max_dd,
        "win_rate": (wins / active) if active else 0.0,
        "trades": trades,
        "bars": int(len(close)),
    }


# -- 5. pipeline -----------------------------------------------------------
def run_pipeline(
    df: pd.DataFrame,
    model: Model | None = None,
    train_ratio: float = 0.7,
    thresh: float = 0.55,
    fee: float = 0.0004,
    slippage: float = 0.0005,
) -> dict:
    X, y = build_features(df)
    if len(X) < 50:
        return {"error": f"insufficient data after features (rows={len(X)})"}
    te, proba = train_predict(X, y, model, train_ratio)
    signals = signals_from_proba(proba, thresh)
    # Map test signals back onto the test slice of the original frame.
    test_df = df.loc[X.index[te]].reset_index(drop=True)
    metrics = backtest(test_df, signals, fee, slippage)
    metrics["test_bars"] = int(len(te))
    return metrics
