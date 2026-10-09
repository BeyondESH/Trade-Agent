"""Read-only LangChain tool registry for the Tier-1 research layer (design D6).

Every tool is a *read* over market data, technical analysis or news. There is
deliberately no order/cancel/transfer/account-write path anywhere in this
module: ``assert_read_only`` is the CI-enforceable guard that the assembly and
tests call, and the Bitget MCP subset is filtered to analysis/market-data names
only. The FastAPI process never imports this module (it pulls ``langchain``).
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass
from typing import Any

import httpx
from langchain_core.tools import BaseTool, tool

from market_data import blockbeats, indicators, levels, newsfeed, smc, structure
from market_data.agent.tool_policy import assert_read_only, is_read_only_mcp_tool_name
from market_data.config import Settings
from market_data.models import Series
from market_data.store import ParquetStore

BITGET_REST_BASE = "https://api.bitget.com"
DEFAULT_TIMEOUT = 10.0
DEFAULT_CATEGORY = "USDT-FUTURES"


@dataclass(frozen=True)
class ResearchTools:
    """The tool groups the research graph composes (main agent gets them all)."""

    technical: list[BaseTool]
    market: list[BaseTool]
    news: list[BaseTool]
    mcp: list[BaseTool]

    @property
    def all(self) -> list[BaseTool]:
        return [*self.technical, *self.market, *self.news, *self.mcp]

    @property
    def technical_and_market(self) -> list[BaseTool]:
        return [*self.technical, *self.market]

    def assert_read_only(self) -> None:
        assert_read_only(self.all)


def _finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _technical_tools(store: ParquetStore) -> list[BaseTool]:
    @tool
    def get_recent_candles(
        symbol: str, timeframe: str, category: str = DEFAULT_CATEGORY, limit: int = 120
    ) -> list[dict]:
        """Return the most recent OHLCV candles for a series (read-only)."""
        df = store.read(Series(category, symbol, timeframe), limit=max(1, min(limit, 500)))
        return df.to_dict(orient="records")

    @tool
    def get_indicators(
        symbol: str, timeframe: str, category: str = DEFAULT_CATEGORY
    ) -> dict[str, Any]:
        """Return the latest KDJ/VEGAS indicator values for a series."""
        df = store.read(Series(category, symbol, timeframe))
        if len(df) < 30:
            return {"error": f"insufficient data (rows={len(df)}, need >=30)"}
        row = indicators.compute(df).iloc[-1]
        keys = (
            "kdj_k",
            "kdj_d",
            "kdj_j",
            "vegas_ema144",
            "vegas_ema169",
        )
        return {key: _finite(row.get(key)) for key in keys}

    @tool
    def get_levels(
        symbol: str, timeframe: str, category: str = DEFAULT_CATEGORY, top: int = 8
    ) -> list[dict]:
        """Return clustered support/resistance levels for a series (read-only)."""
        df = store.read(Series(category, symbol, timeframe))
        if df.empty:
            return []
        return [
            {
                "price": level.price,
                "kind": level.kind,
                "strength": level.strength,
                "sources": level.sources,
            }
            for level in levels.build_levels(df, top_n=max(1, min(top, 50)))
        ]

    @tool
    def get_structure(symbol: str, timeframe: str, category: str = DEFAULT_CATEGORY) -> dict:
        """Return swings, trendlines, box, liquidity, order blocks and BOS/CHOCH."""
        df = store.read(Series(category, symbol, timeframe))
        if len(df) < 30:
            return {"error": f"insufficient data (rows={len(df)}, need >=30)"}
        struct = structure.StructureEngine.analyze(df)
        smc_result = smc.SmcEngine.analyze(df)
        return {
            "swings": [asdict(s) for s in struct["swings"]],
            "trendlines": [asdict(t) for t in struct["trendlines"]],
            "box": asdict(struct["box"]) if struct["box"] else None,
            "liquidity": [asdict(x) for x in smc_result["liquidity"]],
            "order_blocks": {
                k: (asdict(v) if v else None) for k, v in smc_result["order_blocks"].items()
            },
            "bos_choch": [asdict(e) for e in smc_result["bos_choch"]],
        }

    return [get_recent_candles, get_indicators, get_levels, get_structure]


def _default_news_provider(hours: int, category: str) -> list[dict]:
    """Fetch global flash news via AKShare (network; only called while researching)."""
    items_by_source, _ = newsfeed.fetch_all()
    items = [item for group in items_by_source.values() for item in group]
    if hours > 0:
        cutoff = time.time() - hours * 3600
        items = [item for item in items if int(item.get("ts") or 0) >= cutoff]
    if category:
        wanted = {c.strip() for c in category.split(",") if c.strip()}
        items = [item for item in items if item.get("category") in wanted]
    return items


def _broker_provider(broker: Any) -> Callable[..., list[dict]]:
    """Adapt a ``NewsBroker`` (read-only ``recent`` query) to a news provider."""

    def _recent(hours: int, category: str) -> list[dict]:
        return broker.recent(hours=hours or None, categories=category or None)

    return _recent


def _news_tools(news_provider: Callable[..., list[dict]]) -> list[BaseTool]:
    @tool
    def get_global_news(hours: int = 6, category: str = "") -> list[dict]:
        """Return recent global financial headlines, optionally filtered by topic."""
        return news_provider(hours=hours, category=category)

    @tool
    def get_blockbeats_newsflash(type_: str = "all", size: int = 10) -> dict:
        """Return a BlockBeats crypto newsflash list by type (read-only)."""
        return blockbeats.fetch_newsflash(type_, size=max(1, min(size, 50)))

    @tool
    def get_blockbeats_data(endpoint: str) -> dict:
        """Return one BlockBeats market-data series by endpoint name (read-only)."""
        data = blockbeats.fetch_data(endpoint)
        return {"status": data.get("status", 0), "data": data.get("data")}

    return [get_global_news, get_blockbeats_newsflash, get_blockbeats_data]


def _rest_get(client: httpx.Client, path: str, params: dict) -> dict:
    resp = client.get(path, params=params)
    resp.raise_for_status()
    body = resp.json()
    if body.get("code") not in ("00000", 0):
        raise ValueError(f"Bitget error: {body.get('msg') or body.get('code')}")
    return body


def _market_tools(client: httpx.Client) -> list[BaseTool]:
    def _kind(category: str) -> str:
        return "spot" if category.upper() == "SPOT" else "mix"

    @tool
    def get_ticker(symbol: str, category: str = DEFAULT_CATEGORY) -> dict:
        """Return the latest Bitget ticker snapshot for a symbol (read-only)."""
        kind = _kind(category)
        params: dict[str, Any] = {"symbol": symbol}
        if kind == "mix":
            params["productType"] = category
        body = _rest_get(client, f"/api/v2/{kind}/market/ticker", params)
        return {"symbol": symbol, "category": category, "ticker": body.get("data")}

    @tool
    def get_market_depth(symbol: str, category: str = DEFAULT_CATEGORY, limit: int = 20) -> dict:
        """Return the Bitget order book (depth) snapshot for a symbol (read-only)."""
        kind = _kind(category)
        body = _rest_get(
            client, f"/api/v2/{kind}/market/merge-depth", {"symbol": symbol, "limit": limit}
        )
        return {"symbol": symbol, "category": category, "depth": body.get("data")}

    @tool
    def get_funding_rate(symbol: str, category: str = DEFAULT_CATEGORY) -> dict:
        """Return the current/perpetual funding rate for a futures symbol (read-only)."""
        params = {"symbol": symbol, "productType": category}
        body = _rest_get(client, "/api/v2/mix/market/current-fund-rate", params)
        return {"symbol": symbol, "category": category, "funding": body.get("data")}

    @tool
    def get_mark_price(symbol: str, category: str = DEFAULT_CATEGORY) -> dict:
        """Return the current mark price for a futures symbol (read-only)."""
        params = {"symbol": symbol, "productType": category}
        body = _rest_get(client, "/api/v2/mix/market/symbol-price", params)
        return {"symbol": symbol, "category": category, "mark_price": body.get("data")}

    return [get_ticker, get_market_depth, get_funding_rate, get_mark_price]


def _make_mcp_tool(name: str, description: str, client: Any) -> BaseTool:
    """One MCP read tool: a generic JSON `arguments` payload, never a write API."""

    def _call_tool(arguments: dict | None = None) -> Any:
        if not is_read_only_mcp_tool_name(name):
            raise ValueError(f"refusing non read-only MCP tool: {name!r}")
        return client.call_tool(name, arguments or {})

    _call_tool.__name__ = name
    _call_tool.__doc__ = description
    return tool(_call_tool)


def _mcp_tools(client: Any) -> list[BaseTool]:
    """Wrap the read-only analysis/market-data subset of the Bitget MCP server.

    Write tools (order/cancel/transfer/account) are filtered out by name; the
    wrapper is generic (a JSON `arguments` object) so no write signature is ever
    materialised. ``client`` must expose ``list_tools() -> list[str]`` and
    ``tool_schemas() -> dict`` / ``call_tool(name, args)``.
    """
    try:
        names = list(client.list_tools())
    except Exception:  # noqa: BLE001 - MCP is optional; never block assembly
        return []
    try:
        schemas = client.tool_schemas() or {}
    except Exception:  # noqa: BLE001 - descriptions are best-effort
        schemas = {}

    built: list[BaseTool] = []
    for name in names:
        if not is_read_only_mcp_tool_name(name):
            continue
        schema = schemas.get(name) or {}
        description = str(schema.get("description") or f"Read-only Bitget MCP tool {name}.")
        built.append(_make_mcp_tool(name, description, client))
    assert_read_only(built)
    return built


def build_research_tools(
    settings: Settings,
    *,
    store: ParquetStore | None = None,
    news_provider: Callable[..., list[dict]] | None = None,
    news_broker: Any | None = None,
    rest_client: httpx.Client | None = None,
    mcp_client: Any | None = None,
) -> ResearchTools:
    """Assemble the read-only toolset for the research layer.

    Optional collaborators are injectable so tests run without network/npx; in
    production only the Parquet store is required. ``news_broker`` lets a caller
    that *does* run the in-process ``NewsBroker`` reuse its ring buffer instead
    of hitting AKShare.
    """
    parquet = store or ParquetStore(dsn=settings.postgres_dsn)
    client = rest_client or httpx.Client(base_url=BITGET_REST_BASE, timeout=DEFAULT_TIMEOUT)
    provider = news_provider
    if provider is None and news_broker is not None:
        provider = _broker_provider(news_broker)
    toolset = ResearchTools(
        technical=_technical_tools(parquet),
        market=_market_tools(client),
        news=_news_tools(provider or _default_news_provider),
        mcp=_mcp_tools(mcp_client) if mcp_client is not None else [],
    )
    toolset.assert_read_only()
    return toolset
