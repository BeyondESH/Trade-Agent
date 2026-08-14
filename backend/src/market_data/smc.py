"""Smart Money Concepts (SMC) heuristics: liquidity, order blocks, BOS/CHOCH.

Pragmatic, documented heuristics (not an academic standard), using only data up
to the current bar. Marked as iterable/tunable in design D3.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from market_data.structure import Swing, find_swings


@dataclass(frozen=True)
class Liquidity:
    price: float
    side: str  # "high" | "low"
    equal: bool  # part of an equal-highs/lows cluster


@dataclass(frozen=True)
class OrderBlock:
    kind: str  # "bullish" | "bearish"
    lower: float
    upper: float
    open_time: int


@dataclass(frozen=True)
class StructureEvent:
    open_time: int
    type: str  # "BOS" | "CHOCH"
    direction: str  # "up" | "down"


def liquidity_levels(
    df: pd.DataFrame, swings: list[Swing] | None = None, tol: float = 0.001
) -> list[Liquidity]:
    swings = swings if swings is not None else find_swings(df)
    out: list[Liquidity] = []
    for side in ("high", "low"):
        pts = [s for s in swings if s.kind == side]
        for i, s in enumerate(pts):
            equal = any(
                abs(s.price - o.price) <= tol * s.price for j, o in enumerate(pts) if j != i
            )
            out.append(Liquidity(price=s.price, side=side, equal=equal))
    return out


def order_blocks(df: pd.DataFrame) -> dict[str, OrderBlock | None]:
    o = df["open"].to_numpy()
    h = df["high"].to_numpy()
    low = df["low"].to_numpy()
    c = df["close"].to_numpy()
    t = df["open_time"].to_numpy()
    bullish: OrderBlock | None = None
    bearish: OrderBlock | None = None
    for i in range(len(df) - 1):
        # Bullish OB: last down candle before an up-move that clears its high.
        if c[i] < o[i] and c[i + 1] > h[i]:
            bullish = OrderBlock("bullish", float(low[i]), float(h[i]), int(t[i]))
        # Bearish OB: last up candle before a down-move that clears its low.
        if c[i] > o[i] and c[i + 1] < low[i]:
            bearish = OrderBlock("bearish", float(low[i]), float(h[i]), int(t[i]))
    return {"bullish": bullish, "bearish": bearish}


def bos_choch(
    df: pd.DataFrame, swings: list[Swing] | None = None
) -> list[StructureEvent]:
    swings = swings if swings is not None else find_swings(df)
    swings = sorted(swings, key=lambda s: s.open_time)
    events: list[StructureEvent] = []
    prev_high: float | None = None
    prev_low: float | None = None
    trend: str | None = None
    for s in swings:
        if s.kind == "high":
            if prev_high is not None and s.price > prev_high:
                etype = "BOS" if trend == "up" else "CHOCH"
                events.append(StructureEvent(s.open_time, etype, "up"))
                trend = "up"
            prev_high = s.price if prev_high is None else max(prev_high, s.price)
        else:
            if prev_low is not None and s.price < prev_low:
                etype = "BOS" if trend == "down" else "CHOCH"
                events.append(StructureEvent(s.open_time, etype, "down"))
                trend = "down"
            prev_low = s.price if prev_low is None else min(prev_low, s.price)
    return events


class SmcEngine:
    @staticmethod
    def analyze(df: pd.DataFrame) -> dict:
        swings = find_swings(df)
        return {
            "liquidity": liquidity_levels(df, swings),
            "order_blocks": order_blocks(df),
            "bos_choch": bos_choch(df, swings),
        }
