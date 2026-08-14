"""Trading agent: build context, ask a provider, route through risk+execution.

The agent never bypasses the risk gate — all orders go through ExecutionEngine
(default paper). Deferred to later changes: memory/reflection (#6), DL (#7),
real news/`bitget-signal` wiring (only an injection point here).
"""

from __future__ import annotations

import pandas as pd

from market_data import indicators, levels
from market_data.execution import ExecutionEngine, ExecutionResult, OrderRequest
from market_data.llm import AgentDecision, ProviderConfig, RuleBasedProvider


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
            {"price": l.price, "kind": l.kind, "strength": l.strength, "sources": l.sources}
            for l in lv
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
    def __init__(self, provider=None, engine: ExecutionEngine | None = None,  # noqa: ANN001
                 cfg: ProviderConfig | None = None) -> None:
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
