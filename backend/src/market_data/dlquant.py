"""DL/ML quant engine: features -> model -> signals -> backtest.

A scikit-learn model layer (LogisticRegression + StandardScaler by default,
HistGradientBoosting optional) behind a pluggable `Model` interface, with the
backtest/portfolio leg built on vectorbt. No look-ahead: labels are shifted
forward, features use only past/current bars, and backtest positions take
effect on the next bar.
"""

from __future__ import annotations

from typing import Protocol

import numpy as np
import pandas as pd
import vectorbt as vbt
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import log_loss, roc_auc_score, roc_curve
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

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


class SklearnModel:
    """scikit-learn estimator behind the pluggable Model interface.

    Wraps a ``Pipeline(StandardScaler, estimator)`` so standardization is
    always fit on the training set only (no leakage). ``kind`` selects the
    estimator: ``"lr"`` (default LogisticRegression) or ``"hgb"``
    (HistGradientBoostingClassifier). All estimators are seeded for
    deterministic, reproducible runs.
    """

    def __init__(
        self,
        kind: str = "lr",
        *,
        random_state: int = 0,
        scale: bool = True,
        **kwargs: object,
    ) -> None:
        if kind == "lr":
            estimator = LogisticRegression(random_state=random_state, **kwargs)
        elif kind == "hgb":
            estimator = HistGradientBoostingClassifier(
                random_state=random_state, **kwargs
            )
        else:
            raise ValueError(f"unknown model kind: {kind!r}")
        self.kind = kind
        self.random_state = random_state
        self.scale = scale
        self._pipeline: Pipeline = Pipeline(
            [("clf", estimator)]
            if not scale
            else [("scaler", StandardScaler()), ("clf", estimator)]
        )

    def fit(self, X: np.ndarray, y: np.ndarray) -> "SklearnModel":
        Xa = np.asarray(X, dtype="float64")
        ya = np.asarray(y, dtype="float64")
        self._pipeline.fit(Xa, ya)
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        Xa = np.asarray(X, dtype="float64")
        return self._pipeline.predict_proba(Xa)[:, 1]


# Backward-compatible name for the sklearn-based default model.
LogisticRegressionNP = SklearnModel


# -- 3. time split ---------------------------------------------------------
def time_split(n: int, train_ratio: float = 0.7) -> tuple[np.ndarray, np.ndarray]:
    cut = int(n * train_ratio)
    return np.arange(cut), np.arange(cut, n)


def walk_forward_splits(
    n: int, n_splits: int = 5, test_size: int | None = None
) -> list[tuple[np.ndarray, np.ndarray]]:
    """Multi-fold walk-forward splits (TimeSeriesSplit); no leakage."""
    tscv = TimeSeriesSplit(n_splits=n_splits, test_size=test_size)
    return [(tr, te) for tr, te in tscv.split(np.zeros(n))]


def train_predict(
    X: pd.DataFrame,
    y: pd.Series,
    model: Model | None = None,
    train_ratio: float = 0.7,
) -> tuple[np.ndarray, np.ndarray]:
    """Fit on the earlier part, predict proba on the later part.

    Returns (test_index_positions, proba_on_test).
    """
    model = model or SklearnModel()
    tr, te = time_split(len(X), train_ratio)
    model.fit(X.iloc[tr].to_numpy(), y.iloc[tr].to_numpy())
    proba = model.predict_proba(X.iloc[te].to_numpy())
    return te, proba


def model_metrics(y_true: np.ndarray, proba: np.ndarray) -> dict:
    """roc_auc / log_loss on the test set; guards degenerate single-class folds."""
    yt = np.asarray(y_true, dtype="float64")
    p = np.asarray(proba, dtype="float64")
    if len(np.unique(yt)) < 2:
        return {"roc_auc": None, "log_loss": None}
    return {
        "roc_auc": float(roc_auc_score(yt, p)),
        "log_loss": float(log_loss(yt, p)),
    }


def roc_curve_data(y_true: np.ndarray, proba: np.ndarray) -> dict | None:
    """FPR/TPR arrays for the ROC plot; None when not computable (single class)."""
    yt = np.asarray(y_true, dtype="float64")
    p = np.asarray(proba, dtype="float64")
    if len(yt) == 0 or len(np.unique(yt)) < 2:
        return None
    fpr, tpr, _ = roc_curve(yt, p)
    return {
        "fpr": [round(float(v), 6) for v in fpr],
        "tpr": [round(float(v), 6) for v in tpr],
    }


def feature_weights(
    model: Model,
    X_test: np.ndarray,
    y_test: np.ndarray,
    columns: list[str],
) -> dict | None:
    """Feature contribution weights after fit: lr coefficients, tree importances.

    sklearn >= 1.9 removed ``HistGradientBoosting.feature_importances_``, so
    tree models without that attribute fall back to permutation importance on
    the test set. Returns None when neither path is computable (e.g. a
    degenerate single-class test set for the permutation fallback).
    """
    pipeline = getattr(model, "_pipeline", None)
    if pipeline is None:
        return None
    estimator = pipeline._final_estimator
    if hasattr(estimator, "coef_"):
        coef = np.asarray(estimator.coef_, dtype="float64")
        if coef.ndim == 2:
            coef = coef[0]
        return {
            "kind": "coef",
            "features": list(columns),
            "values": [round(float(v), 8) for v in coef],
        }
    if hasattr(estimator, "feature_importances_"):
        imp = np.asarray(estimator.feature_importances_, dtype="float64")
        return {
            "kind": "importance",
            "features": list(columns),
            "values": [round(float(v), 8) for v in imp],
        }
    if len(np.unique(np.asarray(y_test))) < 2:
        return None
    from sklearn.inspection import permutation_importance

    try:
        pi = permutation_importance(
            estimator,
            np.asarray(X_test, dtype="float64"),
            np.asarray(y_test, dtype="float64"),
            n_repeats=5,
            random_state=0,
            scoring="roc_auc",
        )
    except Exception:  # noqa: BLE001 - importance export is best-effort
        return None
    return {
        "kind": "importance",
        "features": list(columns),
        "values": [round(float(v), 8) for v in pi.importances_mean],
    }


# -- 4. signals + backtest -------------------------------------------------
def signals_from_proba(proba: np.ndarray, thresh: float = 0.55) -> np.ndarray:
    sig = np.zeros(len(proba))
    sig[proba >= thresh] = 1.0
    sig[proba <= (1 - thresh)] = -1.0
    return sig


def _timeframe_freq(timeframe: str) -> str | None:
    """Map an internal timeframe token to a pandas offset for vectorbt freq."""
    mapping = {
        "1m": "1min", "3m": "3min", "5m": "5min", "15m": "15min",
        "30m": "30min", "1h": "1h", "2h": "2h", "4h": "4h",
        "6h": "6h", "12h": "12h", "1d": "1D", "3d": "3D",
        "1w": "1W", "1mo": "1ME",
    }
    return mapping.get(timeframe)


def _trade_records(pf, times: pd.Series) -> list[dict]:
    """Map vectorbt trades records to the engine's per-trade contract."""
    if pf.trades.count() == 0:
        return []
    raw = pf.trades.records
    out: list[dict] = []
    for _, row in raw.iterrows():
        side = "long" if int(row["direction"]) == 0 else "short"
        ep = float(row["entry_price"])
        xp = float(row["exit_price"])
        gross = (xp - ep) / ep if side == "long" else (ep - xp) / ep
        out.append({
            "side": side,
            "entry_time": int(times.iloc[int(row["entry_idx"])]),
            "entry_price": round(ep, 8),
            "exit_time": int(times.iloc[int(row["exit_idx"])]),
            "exit_price": round(xp, 8),
            "bars": int(row["exit_idx"]) - int(row["entry_idx"]) + 1,
            "gross_return": round(gross, 8),
            "net_return": round(float(row["return"]), 8),
        })
    return out


def backtest(
    df: pd.DataFrame,
    signals: np.ndarray,
    fee: float = 0.0004,
    slippage: float = 0.0005,
    proba: np.ndarray | None = None,
    timeframe: str = "1h",
    init_cash: float | None = None,
    size: float | None = None,
) -> dict:
    """Vectorbt-backed backtest via ``vbt.Portfolio.from_signals``.

    ``signals[i]`` aligns to df row i; vectorbt fills at the signal bar's
    close by default (no look-ahead — a signal on the last bar yields no
    trade). Long/short mapping: +1 -> long entry / short exit, -1 -> short
    entry / long exit.

    ``init_cash`` / ``size`` are optional vbt.Portfolio knobs; when absent the
    vectorbt defaults apply, keeping the behaviour byte-identical to before.

    Returns the scalar metrics dict plus a ``series`` key carrying per-bar
    open_time / equity / drawdown / signal / proba aligned to df rows, a
    ``trade_list`` key with per-trade records, and a ``stats`` dict with
    vectorbt/QuantStats-derived metrics.
    """
    close_raw = df["close"].reset_index(drop=True)
    times = df["open_time"].reset_index(drop=True)
    sig = pd.Series(signals, index=close_raw.index).reindex(close_raw.index).fillna(0.0)

    entries = (sig == 1.0).astype(bool)
    exits = (sig == 0.0).astype(bool)
    short_entries = (sig == -1.0).astype(bool)
    short_exits = (sig == 0.0).astype(bool)

    pf_kwargs: dict = {
        "fees": fee,
        "slippage": slippage,
        "freq": _timeframe_freq(timeframe),
    }
    if init_cash is not None:
        pf_kwargs["init_cash"] = init_cash
    if size is not None:
        pf_kwargs["size"] = size

    pf = vbt.Portfolio.from_signals(
        close_raw,
        entries,
        exits,
        short_entries=short_entries,
        short_exits=short_exits,
        **pf_kwargs,
    )

    value = pf.value()
    drawdown = pf.drawdown()
    trades_count = int(pf.trades.count())
    if trades_count:
        rec = pf.trades.records_readable
        ret = rec["Return"].astype(float)
        wins = int((ret > 0).sum())
        active = trades_count
    else:
        wins = active = 0
    stats = pf.stats()

    metrics = {
        "total_return": float(pf.total_return()),
        "max_drawdown": float(pf.max_drawdown()),
        "win_rate": (wins / active) if active else 0.0,
        "trades": trades_count,
        "bars": int(len(close_raw)),
    }
    metrics["series"] = {
        "open_time": [int(t) for t in df["open_time"].tolist()],
        "equity": [round(float(v), 8) for v in value.tolist()],
        "drawdown": [round(float(v), 8) for v in drawdown.tolist()],
        "signal": [round(float(v), 8) for v in sig.tolist()],
        "proba": [round(float(p), 8) for p in proba] if proba is not None else [],
        # buy & hold benchmark normalized to 1.0 at the first bar.
        "benchmark": [
            round(float(v), 8)
            for v in (close_raw / close_raw.iloc[0]).tolist()
        ] if len(close_raw) and close_raw.iloc[0] != 0 else [1.0] * len(close_raw),
    }
    metrics["trade_list"] = _trade_records(pf, times)
    stats_dict = {}
    for key in ("Sharpe Ratio", "Sortino Ratio", "Calmar Ratio", "Profit Factor"):
        if key in stats:
            stats_dict[key.replace(" ", "_").lower()] = float(stats[key])
    metrics["stats"] = stats_dict
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
    timeframe: str = "1h",
    init_cash: float | None = None,
    size: float | None = None,
) -> dict:
    X, y = build_features(df, factor_defs)
    if len(X) < 50:
        return {"error": f"insufficient data after features (rows={len(X)})"}
    # Ensure a concrete fitted model is available for weight/ROC exports even
    # when the caller passed None (train_predict would otherwise build its own).
    model = model or SklearnModel()
    te, proba = train_predict(X, y, model, train_ratio)
    signals = signals_from_proba(proba, thresh)
    # Map test signals back onto the test slice of the original frame.
    test_df = df.loc[X.index[te]].reset_index(drop=True)
    result = backtest(test_df, signals, fee, slippage, proba, timeframe,
                      init_cash=init_cash, size=size)
    result["test_bars"] = int(len(te))
    result["data_meta"] = {
        "n_train": int(len(X) - len(te)),
        "n_test": int(len(te)),
        "start": int(test_df["open_time"].iloc[0]),
        "end": int(test_df["open_time"].iloc[-1]),
    }
    y_test = y.iloc[te].to_numpy()
    result["model_metrics"] = model_metrics(y_test, proba)
    weights = feature_weights(model, X.iloc[te].to_numpy(), y_test, list(X.columns))
    if weights is not None:
        result["feature_weights"] = weights
    rc = roc_curve_data(y_test, proba)
    if rc is not None:
        result["roc_curve"] = rc
    return result


# -- 6. parameter sweep + range splitting (vectorbt) -----------------------
def sweep_params(
    df: pd.DataFrame,
    thresholds: list[float],
    fees: list[float] | None = None,
    slippages: list[float] | None = None,
    model: Model | None = None,
    train_ratio: float = 0.7,
    factor_defs: list | None = None,
    timeframe: str = "1h",
) -> dict:
    """Grid-scan thresh (and optionally fee/slippage) over the same model run.

    The model is trained once per (factor set); each param combo then maps the
    same test-set probabilities to signals and backtests via vectorbt.
    """
    X, y = build_features(df, factor_defs)
    if len(X) < 50:
        return {"error": f"insufficient data after features (rows={len(X)})"}
    te, proba = train_predict(X, y, model, train_ratio)
    test_df = df.loc[X.index[te]].reset_index(drop=True)
    fees = fees or [0.0004]
    slippages = slippages or [0.0005]
    rows: list[dict] = []
    for thresh in thresholds:
        for fee in fees:
            for slip in slippages:
                signals = signals_from_proba(proba, thresh)
                r = backtest(test_df, signals, fee, slip, proba, timeframe)
                rows.append({
                    "threshold": thresh,
                    "fee": fee,
                    "slippage": slip,
                    "total_return": r["total_return"],
                    "max_drawdown": r["max_drawdown"],
                    "win_rate": r["win_rate"],
                    "trades": r["trades"],
                })
    return {
        "results": rows,
        "data_meta": {
            "n_train": int(len(X) - len(te)),
            "n_test": int(len(te)),
            "start": int(test_df["open_time"].iloc[0]),
            "end": int(test_df["open_time"].iloc[-1]),
        },
    }


def split_ranges(
    df: pd.DataFrame, n: int | None = None, range_len: int | None = None
) -> list[pd.DataFrame]:
    """Split a frame into N contiguous ranges (vectorbt RangeSplitter)."""
    out: list[pd.DataFrame] = []
    for chunk in vbt.RangeSplitter().split(df, n=n, range_len=range_len):
        if isinstance(chunk, (list, tuple)) and len(chunk) == 1:
            chunk = chunk[0]
        out.append(pd.DataFrame(chunk) if not isinstance(chunk, pd.DataFrame) else chunk)
    return out


def split_walk_forward(
    df: pd.DataFrame, n: int | None = None, window_len: int | None = None
) -> list[pd.DataFrame]:
    """Split a frame into rolling walk-forward windows (vectorbt RollingSplitter)."""
    out: list[pd.DataFrame] = []
    for chunk in vbt.RollingSplitter().split(df, n=n, window_len=window_len):
        if isinstance(chunk, (list, tuple)) and len(chunk) == 1:
            chunk = chunk[0]
        out.append(pd.DataFrame(chunk) if not isinstance(chunk, pd.DataFrame) else chunk)
    return out


def walk_forward_run(
    df: pd.DataFrame,
    model: Model | None = None,
    n_splits: int | None = None,
    thresh: float = 0.55,
    fee: float = 0.0004,
    slippage: float = 0.0005,
    factor_defs: list | None = None,
    timeframe: str = "1h",
) -> dict:
    """Multi-fold walk-forward: train/predict/backtest per fold, aggregate rows.

    Each fold's test set strictly follows its train set (TimeSeriesSplit).
    Returns ``folds`` (per-fold train/test open_time range + metrics +
    roc_auc/log_loss) and ``data_meta`` (n_train/n_test pooled + window).
    """
    X, y = build_features(df, factor_defs)
    if len(X) < 50:
        return {"error": f"insufficient data after features (rows={len(X)})"}
    n = len(X)
    default_splits = max(2, min(5, n // 200)) if n_splits is None else n_splits
    if default_splits < 2:
        return {"error": "insufficient data for walk-forward (need >= 2 folds)"}
    try:
        splits = walk_forward_splits(n, n_splits=default_splits)
    except ValueError as exc:
        return {"error": f"cannot split for walk-forward: {exc}"}
    folds: list[dict] = []
    model_inst = model if model is not None else None
    for tr, te in splits:
        fold_model = model_inst if model_inst is not None else SklearnModel()
        fold_model.fit(X.iloc[tr].to_numpy(), y.iloc[tr].to_numpy())
        proba = fold_model.predict_proba(X.iloc[te].to_numpy())
        test_df = df.loc[X.index[te]].reset_index(drop=True)
        signals = signals_from_proba(proba, thresh)
        r = backtest(test_df, signals, fee, slippage, proba, timeframe)
        mm = model_metrics(y.iloc[te].to_numpy(), proba)
        folds.append({
            "fold": len(folds),
            "train_start": int(df.loc[X.index[tr]]["open_time"].iloc[0]),
            "train_end": int(df.loc[X.index[tr]]["open_time"].iloc[-1]),
            "test_start": int(test_df["open_time"].iloc[0]),
            "test_end": int(test_df["open_time"].iloc[-1]),
            "total_return": r["total_return"],
            "max_drawdown": r["max_drawdown"],
            "win_rate": r["win_rate"],
            "trades": r["trades"],
            "roc_auc": mm["roc_auc"],
            "log_loss": mm["log_loss"],
        })
    return {
        "folds": folds,
        "data_meta": {
            "n_train": int(len(X)),
            "n_test": int(n - (splits[0][0].size)),
            "start": int(df["open_time"].iloc[0]),
            "end": int(df["open_time"].iloc[-1]),
        },
    }


def warmup() -> None:
    """Compile the vectorbt/Numba hot path with a tiny deterministic run.

    Call once at server startup so the first real backtest job doesn't block
    on JIT compilation. Best-effort: never raises.
    """
    closes = 100.0 + np.arange(20, dtype="float64") * 0.5
    df = pd.DataFrame({
        "open_time": [1_700_000_000_000 + i * 60_000 for i in range(len(closes))],
        "open": closes, "high": closes + 1.0, "low": closes - 1.0,
        "close": closes, "volume": [1.0] * len(closes),
    })
    signals = np.array([1.0 if i % 2 == 0 else -1.0 for i in range(len(closes))])
    backtest(df, signals, fee=0.0004, slippage=0.0005, timeframe="1h")
