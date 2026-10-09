"""Read-only tool registry tests (research-agent capability, design D6).

Proves the research toolset is read-only, reuses the existing analysis modules,
and only exposes the Bitget MCP analysis/market-data subset (never a write tool).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from agent_fakes import FakeMcpClient, fake_tools, seeded_store
from langchain_core.tools import tool

from market_data.agent.tool_policy import (
    assert_read_only,
    is_read_only_mcp_tool_name,
    is_read_only_tool_name,
)
from market_data.agent.tools import ResearchTools, build_research_tools
from market_data.config import Settings

TECHNICAL_NAMES = {"get_recent_candles", "get_indicators", "get_levels", "get_structure"}
MARKET_NAMES = {"get_ticker", "get_market_depth", "get_funding_rate", "get_mark_price"}
NEWS_NAMES = {"get_global_news", "get_blockbeats_newsflash", "get_blockbeats_data"}


@pytest.fixture
def toolset(tmp_path: Path, pg_db) -> ResearchTools:  # noqa: ANN001
    settings = Settings(data_dir=tmp_path)
    store = seeded_store(pg_db)
    return fake_tools(settings, store=store)


def _by_name(tools, name: str):  # noqa: ANN001, ANN202
    return next(candidate for candidate in tools if candidate.name == name)


def test_toolset_is_read_only(toolset: ResearchTools) -> None:
    toolset.assert_read_only()
    assert all(is_read_only_tool_name(candidate.name) for candidate in toolset.all)


def test_tool_groups_expose_expected_names(toolset: ResearchTools) -> None:
    assert {c.name for c in toolset.technical} == TECHNICAL_NAMES
    assert {c.name for c in toolset.market} == MARKET_NAMES
    assert {c.name for c in toolset.news} == NEWS_NAMES
    assert {c.name for c in toolset.technical_and_market} == TECHNICAL_NAMES | MARKET_NAMES


def test_technical_tools_reuse_existing_modules(toolset: ResearchTools) -> None:
    indicators = _by_name(toolset.technical, "get_indicators").invoke(
        {"symbol": "BTCUSDT", "timeframe": "1h"}
    )
    assert "error" not in indicators
    assert indicators["kdj_j"] is not None and indicators["vegas_ema144"] is not None

    levels = _by_name(toolset.technical, "get_levels").invoke(
        {"symbol": "BTCUSDT", "timeframe": "1h"}
    )
    assert isinstance(levels, list) and levels

    structure = _by_name(toolset.technical, "get_structure").invoke(
        {"symbol": "BTCUSDT", "timeframe": "1h"}
    )
    assert "swings" in structure and "order_blocks" in structure


def test_news_tool_uses_injected_provider(toolset: ResearchTools) -> None:
    items = _by_name(toolset.news, "get_global_news").invoke({"hours": 6, "category": "crypto"})
    assert items and items[0]["id"] == "n1"


def test_market_tool_reads_via_rest(toolset: ResearchTools) -> None:
    ticker = _by_name(toolset.market, "get_ticker").invoke({"symbol": "BTCUSDT"})
    assert ticker["symbol"] == "BTCUSDT"


def test_news_tool_can_reuse_the_in_process_broker(tmp_path: Path, pg_db) -> None:  # noqa: ANN001
    class _FakeBroker:
        def recent(self, hours=None, categories=None):  # noqa: ANN001, ANN202
            return [{"id": "b1", "title": "from broker"}]

    settings = Settings(data_dir=tmp_path)
    tools = build_research_tools(settings, store=seeded_store(pg_db), news_broker=_FakeBroker())
    items = _by_name(tools.news, "get_global_news").invoke({"hours": 0, "category": ""})
    assert items[0]["id"] == "b1"


def test_insufficient_data_returns_error_not_raise(tmp_path: Path, pg_db) -> None:  # noqa: ANN001
    settings = Settings(data_dir=tmp_path)
    tools = fake_tools(settings, store=seeded_store(pg_db), mcp_names=[])
    out = _by_name(tools.technical, "get_indicators").invoke({"symbol": "NOPE", "timeframe": "1h"})
    assert "error" in out


def test_mcp_only_read_only_names_are_exposed(tmp_path: Path, pg_db) -> None:  # noqa: ANN001
    names = [
        "market_get_candles",
        "analysis_indicators",
        "futures_place_order",
        "spot_cancel_order",
        "account_get_balance",
        "raw",
    ]
    settings = Settings(data_dir=tmp_path)
    tools = build_research_tools(
        settings,
        store=seeded_store(pg_db),
        news_provider=lambda hours, category: [],
        mcp_client=FakeMcpClient(names),
    )
    exposed = {candidate.name for candidate in tools.mcp}
    assert exposed == {"market_get_candles", "analysis_indicators"}
    for candidate in tools.mcp:
        assert is_read_only_mcp_tool_name(candidate.name)


def test_mcp_predicate_rejects_write_verbs() -> None:
    assert is_read_only_mcp_tool_name("market_get_candles") is True
    assert is_read_only_mcp_tool_name("futures_place_order") is False
    assert is_read_only_mcp_tool_name("spot_cancel_order") is False
    assert is_read_only_mcp_tool_name("account_withdraw") is False


def test_assert_read_only_rejects_a_write_tool() -> None:
    @tool
    def place_order(symbol: str) -> str:
        """Place an order (a write path that must never be exposed)."""
        return "no"

    with pytest.raises(ValueError, match="non read-only"):
        assert_read_only([place_order])
