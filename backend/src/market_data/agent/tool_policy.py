"""Read-only tool policy for the Tier-1 research layer (design D6).

The research layer may only read. This module owns the *decision* — which tool
names are acceptable — so both the static registry (``tools.py``) and any
dynamic source (Bitget MCP) apply one guard. ``assert_read_only`` is the CI gate.
"""

from __future__ import annotations

from langchain_core.tools import BaseTool

# Write/account markers: a tool whose name contains any of these is never
# exposed. Kept verb-shaped so read tools that merely mention an entity (e.g.
# `orderbook`) are not caught.
WRITE_TOOL_TOKENS: tuple[str, ...] = (
    "cancel",
    "transfer",
    "withdraw",
    "deposit",
    "place",
    "submit",
    "create",
    "modify",
    "amend",
    "delete",
    "update",
    "buy",
    "sell",
    "trade",
    "account",
    "balance",
    "position",
    "leverage",
    "margin",
    "loan",
    "earn",
    "convert",
    "copy",
    "bot",
    "grid",
    "close",
    "open",
)

# Positive allow-list for MCP tools: analysis / market-data only.
MCP_READONLY_ALLOW_TOKENS: tuple[str, ...] = (
    "market",
    "candle",
    "kline",
    "ticker",
    "price",
    "depth",
    "book",
    "funding",
    "instrument",
    "indicator",
    "analys",
    "analyze",
    "news",
    "history",
    "public",
    "discover",
)


def is_read_only_tool_name(name: str) -> bool:
    """True when a tool name carries no write/account marker."""
    lowered = name.lower()
    return not any(token in lowered for token in WRITE_TOOL_TOKENS)


def is_read_only_mcp_tool_name(name: str) -> bool:
    """MCP tools are exposed only when analysis/market-data AND write-free."""
    lowered = name.lower()
    if not any(token in lowered for token in MCP_READONLY_ALLOW_TOKENS):
        return False
    return is_read_only_tool_name(name)


def assert_read_only(tools: list[BaseTool]) -> None:
    """Hard-fail if any tool looks like a write/account path (fail-closed)."""
    for candidate in tools:
        if not is_read_only_tool_name(candidate.name):
            raise ValueError(f"non read-only tool exposed: {candidate.name!r}")
