"""Offline tests for the AI agent core (provider + context + execution routing).

Run:
    python tests/test_agent.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from market_data.agent import TradingAgent, build_agent_context
from market_data.execution import ExecutionEngine
from market_data.llm import (
    AgentDecision,
    LLMTextProvider,
    ProviderConfig,
    RuleBasedProvider,
    make_provider,
)
from market_data.risk import Portfolio

BASE = 1_700_000_000_000
STEP = 300_000


def _df(closes) -> pd.DataFrame:
    n = len(closes)
    closes = np.array(closes, dtype="float64")
    return pd.DataFrame({
        "open_time": [BASE + i * STEP for i in range(n)],
        "open": closes, "high": closes + 1.0, "low": closes - 1.0,
        "close": closes, "volume": [1.0] * n,
    })


def _ctx(price, levels) -> dict:
    return {"symbol": "BTCUSDT", "timeframe": "1d", "price": price,
            "indicators": {}, "levels": levels, "news": ""}


# -- 5.1 rule-based left-side ---------------------------------------------
def test_rule_open_long_near_support() -> None:
    ctx = _ctx(100.0, [{"price": 99.9, "kind": "support", "strength": 5, "sources": ["swing"]}])
    d = RuleBasedProvider(ProviderConfig(near_pct=0.005, min_strength=2)).propose(ctx)
    assert d.action == "open" and d.side == "long" and d.reference_price == 99.9


def test_rule_open_short_near_resistance() -> None:
    ctx = _ctx(100.0, [{"price": 100.1, "kind": "resistance", "strength": 5, "sources": ["fib"]}])
    d = RuleBasedProvider(ProviderConfig(near_pct=0.005, min_strength=2)).propose(ctx)
    assert d.action == "open" and d.side == "short"


def test_rule_hold_when_far() -> None:
    ctx = _ctx(100.0, [{"price": 80.0, "kind": "support", "strength": 5, "sources": ["swing"]}])
    d = RuleBasedProvider(ProviderConfig(near_pct=0.005)).propose(ctx)
    assert d.action == "hold"


def test_rule_hold_when_weak() -> None:
    ctx = _ctx(100.0, [{"price": 99.9, "kind": "support", "strength": 1, "sources": ["swing"]}])
    d = RuleBasedProvider(ProviderConfig(near_pct=0.005, min_strength=2)).propose(ctx)
    assert d.action == "hold"


# -- 5.2 LLM text provider -------------------------------------------------
def test_llm_parses_valid_json() -> None:
    def complete(system, user):  # noqa: ANN001
        return '{"action":"open","side":"long","reference_price":99.5,"reason":"x","confidence":0.7}'
    d = LLMTextProvider(complete).propose(_ctx(100.0, []))
    assert d.action == "open" and d.side == "long" and d.confidence == 0.7


def test_llm_wraps_prose_json() -> None:
    def complete(system, user):  # noqa: ANN001
        return 'Sure! {"action":"hold","side":null,"reason":"wait"} done'
    d = LLMTextProvider(complete).propose(_ctx(100.0, []))
    assert d.action == "hold" and d.side is None


def test_llm_fallback_on_garbage() -> None:
    def complete(system, user):  # noqa: ANN001
        return "no json here"
    d = LLMTextProvider(complete).propose(_ctx(100.0, []))
    assert d.action == "hold" and "fallback" in d.reason


# -- 5.3 context -----------------------------------------------------------
def test_context_shape() -> None:
    df = _df([100 + i for i in range(60)])
    ctx = build_agent_context(df, "BTCUSDT", "1d", news="macro bullish")
    assert ctx["symbol"] == "BTCUSDT" and "price" in ctx
    assert "indicators" in ctx and isinstance(ctx["levels"], list)
    assert ctx["news"] == "macro bullish"


def test_context_news_optional() -> None:
    df = _df([100 + i for i in range(60)])
    ctx = build_agent_context(df, "BTCUSDT", "1d")
    assert ctx["news"] == ""


# -- 5.4 execution routing -------------------------------------------------
def test_agent_open_routes_through_risk() -> None:
    engine = ExecutionEngine(portfolio=Portfolio(equity=1000.0))
    agent = TradingAgent(engine=engine)
    decision = AgentDecision("open", "BTCUSDT", "long", 100.0, "test", 0.6)
    res = agent.act(decision, 100.0)
    assert res.approved and res.filled
    assert "BTCUSDT" in engine.portfolio.positions


def test_agent_open_blocked_by_risk() -> None:
    from market_data.risk import Position
    pf = Portfolio(equity=1000.0)
    pf.positions["ETHUSDT"] = Position("ETHUSDT", "long", 50.0, 5000.0, 1.0, 100)  # full
    engine = ExecutionEngine(portfolio=pf)
    agent = TradingAgent(engine=engine)
    decision = AgentDecision("open", "BTCUSDT", "long", 100.0, "test", 0.6)
    res = agent.act(decision, 100.0)
    assert not res.filled and "BTCUSDT" not in pf.positions


def test_agent_hold_no_action() -> None:
    engine = ExecutionEngine(portfolio=Portfolio(equity=1000.0))
    agent = TradingAgent(engine=engine)
    res = agent.act(AgentDecision("hold", "BTCUSDT"), 100.0)
    assert res is None and not engine.portfolio.positions


# -- 5.5 config + factory --------------------------------------------------
def test_config_rejects_bad_values() -> None:
    for kwargs in ({"near_pct": 0.0}, {"leverage": 0.5}, {"min_strength": -1}):
        raised = False
        try:
            ProviderConfig(**kwargs)
        except ValueError:
            raised = True
        assert raised, f"ProviderConfig({kwargs}) should raise"


def test_make_provider_rule() -> None:
    p = make_provider(ProviderConfig(kind="rule"))
    assert isinstance(p, RuleBasedProvider)


def test_make_provider_llm_injected() -> None:
    p = make_provider(ProviderConfig(kind="llm"), complete=lambda s, u: '{"action":"hold"}')
    assert isinstance(p, LLMTextProvider)


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All agent tests passed.")


if __name__ == "__main__":
    _run_all()
