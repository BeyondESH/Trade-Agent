"""Technical indicators, self-implemented on pandas/numpy (no TA-Lib/pandas-ta).

All indicators use only data up to the current bar (no look-ahead) and return
NaN where there is insufficient history rather than raising.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def macd(
    close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9
) -> pd.DataFrame:
    dif = ema(close, fast) - ema(close, slow)
    dea = ema(dif, signal)
    hist = 2.0 * (dif - dea)
    return pd.DataFrame({"dif": dif, "dea": dea, "macd_hist": hist})


def kdj(
    high: pd.Series, low: pd.Series, close: pd.Series, n: int = 9
) -> pd.DataFrame:
    low_min = low.rolling(n).min()
    high_max = high.rolling(n).max()
    rng = (high_max - low_min).replace(0, np.nan)
    rsv = (close - low_min) / rng * 100.0
    k = rsv.ewm(alpha=1 / 3, adjust=False).mean()
    d = k.ewm(alpha=1 / 3, adjust=False).mean()
    j = 3 * k - 2 * d
    return pd.DataFrame({"kdj_k": k, "kdj_d": d, "kdj_j": j})


def bollinger(close: pd.Series, n: int = 20, mult: float = 2.0) -> pd.DataFrame:
    mid = close.rolling(n).mean()
    std = close.rolling(n).std(ddof=0)
    return pd.DataFrame(
        {"boll_mid": mid, "boll_upper": mid + mult * std, "boll_lower": mid - mult * std}
    )


def vegas(close: pd.Series) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "vegas_ema144": ema(close, 144),
            "vegas_ema169": ema(close, 169),
            "vegas_ema576": ema(close, 576),
            "vegas_ema676": ema(close, 676),
        }
    )


def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    """Wilder RSI. Returns NaN where there is insufficient history."""
    delta = close.diff()
    up = delta.clip(lower=0.0)
    down = (-delta).clip(lower=0.0)
    avg_up = up.ewm(alpha=1 / n, adjust=False).mean()
    avg_down = down.ewm(alpha=1 / n, adjust=False).mean()
    rs = avg_up / avg_down.replace(0, np.nan)
    return 100.0 - 100.0 / (1.0 + rs)


def atr(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    """Average True Range (Wilder). NaN until history accumulates."""
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def vol_ratio(volume: pd.Series, n: int = 20) -> pd.Series:
    """Volume over its rolling average — NaN before `n` bars accumulate."""
    return volume / volume.rolling(n).mean()


def mom(close: pd.Series, n: int = 10) -> pd.Series:
    """N-bar momentum (pct change)."""
    return close.pct_change(n)


FIB_RATIOS = (0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0)


def fib_levels(
    high: pd.Series, low: pd.Series, lookback: int = 120
) -> dict[float, float]:
    """Fibonacci retracement over the most recent `lookback` bars.

    Returns {ratio: price} measured from swing high down toward swing low.
    """
    hi = high.tail(lookback).max()
    lo = low.tail(lookback).min()
    if not np.isfinite(hi) or not np.isfinite(lo) or hi == lo:
        return {}
    span = hi - lo
    return {r: float(hi - r * span) for r in FIB_RATIOS}


def compute(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of df with all indicator columns appended."""
    out = df.copy()
    out = out.join(macd(out["close"]))
    out = out.join(kdj(out["high"], out["low"], out["close"]))
    out = out.join(bollinger(out["close"]))
    out = out.join(vegas(out["close"]))
    return out


class IndicatorSet:
    """Convenience wrapper around the functional indicators."""

    @staticmethod
    def compute(df: pd.DataFrame) -> pd.DataFrame:
        return compute(df)

    @staticmethod
    def fib(df: pd.DataFrame, lookback: int = 120) -> dict[float, float]:
        return fib_levels(df["high"], df["low"], lookback)
