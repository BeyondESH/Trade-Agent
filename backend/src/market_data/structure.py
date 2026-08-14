"""Market structure: swing points, trendlines, and box/range detection.

Deterministic heuristics using only data up to the current bar. A swing is only
confirmed once `k` bars exist to its right.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Swing:
    open_time: int
    price: float
    kind: str  # "high" | "low"


@dataclass(frozen=True)
class Trendline:
    kind: str  # "resistance" (from highs) | "support" (from lows)
    slope: float
    intercept: float
    projection: float  # value at the last bar


@dataclass(frozen=True)
class Box:
    lower: float
    upper: float


def find_swings(df: pd.DataFrame, k: int = 2) -> list[Swing]:
    highs = df["high"].to_numpy()
    lows = df["low"].to_numpy()
    times = df["open_time"].to_numpy()
    n = len(df)
    swings: list[Swing] = []
    for i in range(k, n - k):
        window_h = highs[i - k : i + k + 1]
        window_l = lows[i - k : i + k + 1]
        if highs[i] == window_h.max() and (window_h.argmax() == k):
            swings.append(Swing(int(times[i]), float(highs[i]), "high"))
        if lows[i] == window_l.min() and (window_l.argmin() == k):
            swings.append(Swing(int(times[i]), float(lows[i]), "low"))
    return swings


def _fit(points: list[Swing]) -> tuple[float, float] | None:
    if len(points) < 2:
        return None
    x = np.array([p.open_time for p in points], dtype="float64")
    y = np.array([p.price for p in points], dtype="float64")
    x0 = x - x[0]  # improve conditioning
    slope, intercept = np.polyfit(x0, y, 1)
    return float(slope), float(intercept - slope * x[0])


def fit_trendlines(
    df: pd.DataFrame, swings: list[Swing] | None = None, use_last: int = 3
) -> list[Trendline]:
    swings = swings if swings is not None else find_swings(df)
    last_x = float(df["open_time"].iloc[-1])
    result: list[Trendline] = []
    for kind, label in (("high", "resistance"), ("low", "support")):
        pts = [s for s in swings if s.kind == kind][-use_last:]
        fit = _fit(pts)
        if fit is None:
            continue
        slope, intercept = fit
        result.append(
            Trendline(label, slope, intercept, projection=slope * last_x + intercept)
        )
    return result


def detect_box(
    df: pd.DataFrame,
    window: int = 60,
    max_width: float = 0.15,
    touch_tol: float = 0.02,
    min_touches: int = 2,
) -> Box | None:
    seg = df.tail(window)
    if len(seg) < window // 2:
        return None
    hi = float(seg["high"].max())
    lo = float(seg["low"].min())
    if lo <= 0 or (hi - lo) / lo > max_width:
        return None
    upper_touches = int((seg["high"] >= hi * (1 - touch_tol)).sum())
    lower_touches = int((seg["low"] <= lo * (1 + touch_tol)).sum())
    if upper_touches >= min_touches and lower_touches >= min_touches:
        return Box(lower=lo, upper=hi)
    return None


class StructureEngine:
    @staticmethod
    def analyze(df: pd.DataFrame, k: int = 2) -> dict:
        swings = find_swings(df, k)
        return {
            "swings": swings,
            "trendlines": fit_trendlines(df, swings),
            "box": detect_box(df),
        }
