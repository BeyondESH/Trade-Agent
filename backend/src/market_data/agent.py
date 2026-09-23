"""Trading agent: build context, ask a provider, route through risk+execution.

The agent never bypasses the risk gate — all orders go through ExecutionEngine
(default paper). Deferred to later changes: memory/reflection (#6), DL (#7),
real news/`bitget-signal` wiring (only an injection point here).
"""

from __future__ import annotations

import pandas as pd

from market_data import indicators, levels
from market_data.execution import ExecutionEngine, OrderRequest
from market_data.llm import AgentDecision, ProviderConfig, RuleBasedProvider

# News digest defaults: crypto/macro over a 24h window, bounded for prompts.
NEWS_DIGEST_CATEGORIES = ("crypto", "macro")
NEWS_DIGEST_HOURS = 24
NEWS_DIGEST_MAX_ITEMS = 10


def format_news_digest(
    items: list[dict],
    *,
    categories: tuple[str, ...] = NEWS_DIGEST_CATEGORIES,
    max_items: int = NEWS_DIGEST_MAX_ITEMS,
    max_chars: int = 1200,
) -> str:
    """Filter `items` by category, keep the newest `max_items` and join each as
    `title：content`; the whole digest is truncated to `max_chars`.

    Pure and broker-agnostic: an empty (or fully filtered-out) input yields `""`.
    """
    cats = set(categories)
    matched = [item for item in items if item.get("category") in cats]
    matched.sort(key=lambda item: item.get("ts") or 0, reverse=True)
    lines = [
        f"{item.get('title') or ''}：{item.get('content') or ''}" for item in matched[:max_items]
    ]
    return "\n".join(lines)[:max_chars]


def build_agent_context(
    df: pd.DataFrame,
    symbol: str,
    timeframe: str,
    news: str | None = None,
    top_n: int = 8,
) -> dict:
    """Assemble a structured context from OHLCV data (+ optional news)."""
    ind = indicators.compute(df).iloc[-1]
    lv = levels.build_levels(df, top_n=top_n)
    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "price": float(df["close"].iloc[-1]),
        "indicators": {
            "macd_hist": _num(ind.get("macd_hist")),
            "kdj_j": _num(ind.get("kdj_j")),
            "boll_upper": _num(ind.get("boll_upper")),
            "boll_lower": _num(ind.get("boll_lower")),
            "vegas144": _num(ind.get("vegas_ema144")),
        },
        "levels": [
            {
                "price": level.price,
                "kind": level.kind,
                "strength": level.strength,
                "sources": level.sources,
            }
            for level in lv
        ],
        "news": news or "",
    }


def _num(v) -> float | None:  # noqa: ANN001
    try:
        f = float(v)
        return f if f == f else None  # NaN -> None
    except (TypeError, ValueError):
        return None


class TradingAgent:
    def __init__(
        self,
        provider=None,
        engine: ExecutionEngine | None = None,  # noqa: ANN001
        cfg: ProviderConfig | None = None,
    ) -> None:
        self.cfg = cfg or ProviderConfig()
        self.provider = provider or RuleBasedProvider(self.cfg)
        self.engine = engine or ExecutionEngine()

    def run(
        self, df: pd.DataFrame, symbol: str, timeframe: str, news: str | None = None
    ) -> AgentDecision:
        context = build_agent_context(df, symbol, timeframe, news)
        return self.provider.propose(context)

    def act(self, decision: AgentDecision, price: float):
        if decision.action == "open" and decision.side in ("long", "short"):
            order = OrderRequest(
                category=self.cfg.category,
                symbol=decision.symbol,
                side=decision.side,
                intended_leverage=self.cfg.leverage,
                price=decision.reference_price or price,
            )
            return self.engine.place(order, price)
        if decision.action == "close":
            return self.engine.close(decision.symbol, price)
        return None  # hold
