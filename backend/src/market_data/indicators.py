"""Technical indicators computed via the vectorbt Indicator framework.

Function signatures are preserved (the factor DSL in factors.py depends on
them). RSI/ATR/BBANDS/MACD are computed by vectorbt standard implementations;
KDJ-J, VEGAS channels and Fibonacci retracements have no vectorbt-native
counterpart and remain thin pandas/numpy wrappers. All indicators only use
data up to the current bar (no look-ahead) and return NaN where there is
insufficient history rather than raising.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import vectorbt as vbt


def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def macd(
    close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9
) -> pd.DataFrame:
    ind = vbt.MACD.run(
        close,
        fast_window=fast,
        slow_window=slow,
        signal_window=signal,
        macd_ewm=True,
        signal_ewm=True,
    )
    return pd.DataFrame(
        {"dif": ind.macd, "dea": ind.signal, "macd_hist": ind.hist}
    )


def kdj(
    high: pd.Series, low: pd.Series, close: pd.Series, n: int = 9
) -> pd.DataFrame:
    """Chinese-style KDJ (rsv -> ewm(1/3) K/D, J = 3K - 2D). No vectorbt native."""
    low_min = low.rolling(n).min()
    high_max = high.rolling(n).max()
    rng = (high_max - low_min).replace(0, np.nan)
    rsv = (close - low_min) / rng * 100.0
    k = rsv.ewm(alpha=1 / 3, adjust=False).mean()
    d = k.ewm(alpha=1 / 3, adjust=False).mean()
    j = 3 * k - 2 * d
    return pd.DataFrame({"kdj_k": k, "kdj_d": d, "kdj_j": j})


def bollinger(close: pd.Series, n: int = 20, mult: float = 2.0) -> pd.DataFrame:
    ind = vbt.BBANDS.run(close, window=n, alpha=mult)
    return pd.DataFrame(
        {"boll_mid": ind.middle, "boll_upper": ind.upper, "boll_lower": ind.lower}
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
    """RSI (vectorbt standard; ewm=True keeps Wilder smoothing)."""
    return vbt.RSI.run(close, window=n, ewm=True).rsi


def atr(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    """Average True Range via vectorbt (Wilder ewm by default)."""
    return vbt.ATR.run(high, low, close, window=n).atr


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
