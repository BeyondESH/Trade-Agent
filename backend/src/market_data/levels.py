"""Support/Resistance aggregation across indicators + structure + SMC (D4)."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from market_data import indicators, smc, structure


@dataclass
class Level:
    price: float
    kind: str  # "support" | "resistance"
    sources: list[str] = field(default_factory=list)
    strength: float = 0.0


def _collect(df: pd.DataFrame) -> list[tuple[float, str]]:
    """Gather candidate (price, source) pairs from every source."""
    out: list[tuple[float, str]] = []
    ind = indicators.compute(df).iloc[-1]
    for col, label in (
        ("boll_upper", "boll"),
        ("boll_lower", "boll"),
        ("vegas_ema144", "vegas"),
        ("vegas_ema169", "vegas"),
    ):
        v = ind.get(col)
        if v is not None and np.isfinite(v):
            out.append((float(v), label))

    for _ratio, price in indicators.fib_levels(df["high"], df["low"]).items():
        out.append((price, "fib"))

    # Compute swings once and reuse across structure + SMC sources.
    swings = structure.find_swings(df)
    for s in swings:
        out.append((s.price, "swing"))
    box = structure.detect_box(df)
    if box is not None:
        out.append((box.lower, "box"))
        out.append((box.upper, "box"))

    for liq in smc.liquidity_levels(df, swings):
        out.append((liq.price, "liquidity"))
    for ob in smc.order_blocks(df).values():
        if ob is not None:
            out.append((ob.lower, "ob"))
            out.append((ob.upper, "ob"))
    return out


def _touch_count(df: pd.DataFrame, price: float, tol: float) -> int:
    band = tol * price
    near_high = (df["high"] - price).abs() <= band
    near_low = (df["low"] - price).abs() <= band
    return int((near_high | near_low).sum())


def build_levels(
    df: pd.DataFrame, tol: float = 0.001, top_n: int | None = None
) -> list[Level]:
    if df.empty:
        return []
    last_close = float(df["close"].iloc[-1])
    candidates = sorted(
        (c for c in _collect(df) if np.isfinite(c[0]) and c[0] > 0), key=lambda x: x[0]
    )
    clusters: list[Level] = []
    for price, source in candidates:
        if clusters and abs(price - clusters[-1].price) <= tol * price:
            cluster = clusters[-1]
            n = len(cluster.sources)
            cluster.price = (cluster.price * n + price) / (n + 1)
            cluster.sources.append(source)
        else:
            clusters.append(Level(price=price, kind="", sources=[source]))

    for lvl in clusters:
        distinct = len(set(lvl.sources))
        touches = _touch_count(df, lvl.price, tol)
        lvl.strength = distinct + 0.1 * touches
        lvl.kind = "resistance" if lvl.price >= last_close else "support"
        lvl.sources = sorted(set(lvl.sources))

    clusters.sort(key=lambda l: l.strength, reverse=True)
    return clusters[:top_n] if top_n else clusters
