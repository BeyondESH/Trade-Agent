"""Discover the MCP tool surface (task 2.3).

Run this once against a live environment to confirm the exact tool name,
parameters and per-request limit of the candles operation, then adjust
`models._TIMEFRAME_GRANULARITY` / `ingestion` param mapping if needed.

Usage:
    python -m market_data.discover
"""

from __future__ import annotations

import json
import logging

from market_data.config import get_settings, setup_logging
from market_data.mcp_client import McpDataClient

logger = logging.getLogger(__name__)


def main() -> None:
    setup_logging()
    settings = get_settings()
    with McpDataClient(settings.mcp_command, settings.mcp_args) as client:
        tools = client.list_tools()
        logger.info("Available MCP tools: %s", tools)

        # Print the `market` verb's input schema to confirm the candles contract.
        schemas = client.tool_schemas()
        if "market" in schemas:
            print("=== market tool inputSchema ===")
            print(json.dumps(schemas["market"], indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
