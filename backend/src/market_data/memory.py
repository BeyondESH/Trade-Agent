"""Trade memory & reflection (design D5): journal + RAG-style retrieval +
reflection engine (heuristic baseline, optional LLM) + param/rule suggestions.

Dependency-light: no vector DB / embedding model. Similarity is computed over
interpretable situation features. Parameter suggestions are advisory only.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable

Complete = Callable[[str, str], str]


@dataclass
class TradeRecord:
    id: str
    symbol: str
    timeframe: str
    side: str  # "long" | "short"
    entry_price: float
    exit_price: float | None = None
    notional: float = 0.0
    margin: float = 0.0
    leverage: float = 0.0
    pnl: float | None = None
    opened_at: int = 0
    closed_at: int | None = None
    strategy: str = ""
    reason: str = ""
    reflection: str = ""
    features: dict = field(default_factory=dict)

    @property
    def is_closed(self) -> bool:
        return self.exit_price is not None and self.pnl is not None


class TradeJournal:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def append(self, record: TradeRecord) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(asdict(record), ensure_ascii=False) + "\n")

    def all(self) -> list[TradeRecord]:
        if not self.path.exists():
            return []
        out: list[TradeRecord] = []
        with self.path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    out.append(TradeRecord(**json.loads(line)))
        return out

    def closed(self) -> list[TradeRecord]:
        return [t for t in self.all() if t.is_closed]


# -- features & similarity -------------------------------------------------
def features_from_context(context: dict) -> dict:
    price = context.get("price", 0.0) or 0.0
    ind = context.get("indicators", {}) or {}
    macd = ind.get("macd_hist")
    kdj = ind.get("kdj_j")
    levels = context.get("levels", []) or []

    supports = [l["price"] for l in levels if l.get("kind") == "support" and l["price"] <= price]
    resistances = [l["price"] for l in levels if l.get("kind") == "resistance" and l["price"] >= price]
    dist_sup = (price - max(supports)) / price if supports and price else 1.0
    dist_res = (min(resistances) - price) / price if resistances and price else 1.0

    return {
        "macd_sign": _sign(macd),
        "kdj_zone": _zone(kdj),
        "dist_to_support_pct": round(dist_sup, 4),
        "dist_to_resistance_pct": round(dist_res, 4),
    }


def _sign(v) -> int:  # noqa: ANN001
    if v is None:
        return 0
    return 1 if v > 0 else (-1 if v < 0 else 0)


def _zone(j) -> str:  # noqa: ANN001
    if j is None:
        return "mid"
    if j < 20:
        return "low"
    if j > 80:
        return "high"
    return "mid"


def similarity(a: dict, b: dict) -> float:
    """Blend categorical equality with normalized numeric closeness -> [0,1]."""
    score = 0.0
    weight = 0.0
    # categorical
    for key, w in (("macd_sign", 1.0), ("kdj_zone", 1.0)):
        weight += w
        if a.get(key) == b.get(key):
            score += w
    # numeric (closer -> higher)
    for key, w in (("dist_to_support_pct", 1.0), ("dist_to_resistance_pct", 1.0)):
        weight += w
        av, bv = a.get(key), b.get(key)
        if av is not None and bv is not None:
            score += w * max(0.0, 1.0 - min(1.0, abs(av - bv)))
    return score / weight if weight else 0.0


class MemoryStore:
    def __init__(self, journal: TradeJournal) -> None:
        self.journal = journal

    def retrieve(self, features: dict, k: int = 3, side: str | None = None) -> list[TradeRecord]:
        trades = self.journal.closed()
        if side is not None:
            trades = [t for t in trades if t.side == side]
        if not trades:
            return []
        ranked = sorted(
            trades, key=lambda t: similarity(features, t.features or {}), reverse=True
        )
        return ranked[:k]


# -- reflection engine -----------------------------------------------------
class Reflector:
    MIN_SAMPLES = 5
    LOW_WINRATE = 0.4

    def reflect(self, trade: TradeRecord, complete: Complete | None = None) -> str:
        heuristic = self._heuristic(trade)
        if complete is None:
            return heuristic
        try:
            out = complete(
                "Summarize this closed trade and one lesson in <=2 sentences.",
                json.dumps(asdict(trade), ensure_ascii=False, default=str),
            )
            return out.strip() or heuristic
        except Exception:  # noqa: BLE001 - fall back to heuristic
            return heuristic

    @staticmethod
    def _heuristic(trade: TradeRecord) -> str:
        outcome = "win" if (trade.pnl or 0) > 0 else "loss"
        macd = trade.features.get("macd_sign", 0)
        return (
            f"{outcome}: {trade.side} {trade.symbol} pnl={trade.pnl:.2f} "
            f"(entry {trade.entry_price}, macd_sign={macd}). "
            f"{'Level held.' if outcome == 'win' else 'Level failed; review entry timing.'}"
        )

    def suggest_param_adjustments(self, trades: list[TradeRecord], cfg=None) -> dict:  # noqa: ANN001
        closed = [t for t in trades if t.is_closed]
        if len(closed) < self.MIN_SAMPLES:
            return {}
        wins = sum(1 for t in closed if (t.pnl or 0) > 0)
        winrate = wins / len(closed)
        suggestions: dict = {}
        if winrate < self.LOW_WINRATE:
            suggestions["min_strength"] = "+1"        # be more selective
            suggestions["near_pct"] = "narrow"        # require closer to level
            suggestions["_rationale"] = f"win rate {winrate:.0%} over {len(closed)} trades"
        return suggestions

    def distill_rules(self, trades: list[TradeRecord]) -> list[str]:
        closed = [t for t in trades if t.is_closed]
        rules: list[str] = []
        # Losing longs when MACD strongly negative.
        losing_long_neg = [
            t for t in closed
            if t.side == "long" and (t.pnl or 0) < 0 and t.features.get("macd_sign") == -1
        ]
        if len(losing_long_neg) >= 2:
            rules.append("Avoid opening long when MACD histogram is strongly negative.")
        losing_short_pos = [
            t for t in closed
            if t.side == "short" and (t.pnl or 0) < 0 and t.features.get("macd_sign") == 1
        ]
        if len(losing_short_pos) >= 2:
            rules.append("Avoid opening short when MACD histogram is strongly positive.")
        return rules


# -- integration -----------------------------------------------------------
def augment_context(context: dict, memories: list[TradeRecord], rules: list[str]) -> dict:
    out = dict(context)
    out["memories"] = [
        {
            "side": m.side,
            "pnl": m.pnl,
            "reason": m.reason,
            "reflection": m.reflection,
            "features": m.features,
        }
        for m in memories
    ]
    out["rules"] = list(rules)
    return out
