"""Tier-1 research graph: Deep Agents over the read-only toolset (research-agent).

``build_research_graph`` wires ``create_deep_agent`` with two subagents
(``news-analyst`` / ``technical-analyst``), the planning middleware, an
in-thread ``StateBackend`` and the ``StrategyProposal`` response contract. It
returns an ordinary ``CompiledStateGraph`` (a plain LangGraph graph), so the
runtime can share one checkpointer across both tiers.

This module is the ONLY place an LLM is instantiated. The FastAPI process must
never import it (enforced by the import-graph boundary test).
"""

from __future__ import annotations

from typing import Any

from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from langchain.agents.middleware import TodoListMiddleware
from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool

from market_data.agent.proposal import StrategyProposal
from market_data.agent.tools import ResearchTools, build_research_tools
from market_data.config import Settings

NEWS_ANALYST = "news-analyst"
TECHNICAL_ANALYST = "technical-analyst"
SUBAGENT_NAMES: tuple[str, ...] = (NEWS_ANALYST, TECHNICAL_ANALYST)

RESEARCH_SYSTEM_PROMPT = (
    "You are a senior crypto market research analyst. Produce ONE actionable "
    "strategy proposal for the requested symbol/timeframe using only the "
    "read-only tools available to you. Delegate deep dives via the `task` tool: "
    "`news-analyst` for news/sentiment and `technical-analyst` for price action. "
    "Cite the concrete evidence behind your call in `evidence`, keep `provenance` "
    "accurate, and set a realistic `expires_at` TTL. Never invent position size "
    "or leverage: execution sizing is deterministic and ignores it."
)

NEWS_ANALYST_PROMPT = (
    "You are a crypto news and sentiment analyst. Use only read-only news tools "
    "to summarise the last few hours of headlines, flag high-signal catalysts "
    "(ETF, regulation, macro, exchange events) and return a concise briefing "
    "with concrete sources. You never place or suggest orders."
)

TECHNICAL_ANALYST_PROMPT = (
    "You are a crypto technical analyst. Use only read-only market/indicator "
    "tools to describe trend, momentum, structure and key support/resistance "
    "levels for the requested symbol/timeframe. Return a concise, evidence-based "
    "briefing. You never place or suggest orders."
)


def build_subagents(tools: ResearchTools) -> list[dict[str, Any]]:
    """Dict-spec subagents: isolated context, own tool subset, no shared state."""
    return [
        {
            "name": NEWS_ANALYST,
            "description": "News/sentiment deep dive; returns a cited briefing.",
            "system_prompt": NEWS_ANALYST_PROMPT,
            "tools": tools.news,
        },
        {
            "name": TECHNICAL_ANALYST,
            "description": "Technical/market deep dive; returns a cited briefing.",
            "system_prompt": TECHNICAL_ANALYST_PROMPT,
            "tools": tools.technical_and_market,
        },
    ]


def build_research_graph(
    settings: Settings,
    *,
    tools: ResearchTools | None = None,
    checkpointer: Any | None = None,
    model: str | BaseChatModel | None = None,
) -> Any:
    """Compile the Tier-1 research graph (``response_format=StrategyProposal``)."""
    toolset = tools or build_research_tools(settings)
    toolset.assert_read_only()
    all_tools: list[BaseTool] = toolset.all
    return create_deep_agent(
        model=model or settings.agent_model,
        tools=all_tools,
        system_prompt=RESEARCH_SYSTEM_PROMPT,
        middleware=[TodoListMiddleware()],
        subagents=build_subagents(toolset),
        backend=StateBackend(),
        response_format=StrategyProposal,
        checkpointer=checkpointer,
        name="research",
    )
