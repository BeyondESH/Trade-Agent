"""BlockBeats news/data proxy client for the web API.

The BlockBeats API (`api-pro.theblockbeats.info`) requires an `api-key`
request header. The key is kept server-side (from the environment / config,
never shipped to the browser) and the frontend talks only to our own
`/api/blockbeats/*` routes.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api-pro.theblockbeats.info"
DEFAULT_TIMEOUT = 15.0

# /v1/newsflash/{type} — the 10 public newsflash endpoints plus "all".
NEWSFLASH_TYPES = (
    "all",
    "24h",
    "important",
    "original",
    "first",
    "onchain",
    "financing",
    "prediction",
    "ai",
    "stock",
)

# /v1/data/{endpoint} — the 11 data endpoints.
DATA_ENDPOINTS = (
    "btc_etf",
    "daily_volume",
    "ibit_fbtc",
    "stablecoin_mcap",
    "exchange_assets",
    "treasury_10y",
    "dxy",
    "bitfinex_long",
    "contract_platforms",
    "bottom_top_indicator",
    "top10_netflow",
)


def api_key() -> str:
    """Return the BlockBeats API key from the app configuration.

    Read through the pydantic Settings chain so `backend/.env` (`BB_API_KEY=`)
    works out of the box, falling back to the `MD_BB_API_KEY` env var.
    """
    from market_data.config import get_settings

    key = get_settings().bb_api_key.strip()
    if not key:
        raise ValueError("BB_API_KEY is not set")
    return key


def _normalize_flash(row: dict) -> dict:
    """Normalize a newsflash row into a stable shape for the frontend."""
    out = dict(row)
    # `create_time` may be "Y-m-d H:i:s" or an epoch-seconds string.
    raw = row.get("create_time")
    if isinstance(raw, (int, float)) or (
        isinstance(raw, str) and raw.isdigit() and len(raw) >= 10
    ):
        out["create_time"] = int(raw)
    return out


def _get(path: str, params: dict | None = None) -> dict[str, Any]:
    key = api_key()
    resp = httpx.get(
        f"{BASE_URL}{path}",
        params=params,
        headers={"api-key": key},
        timeout=DEFAULT_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_newsflash(
    type_: str,
    page: int = 1,
    size: int = 10,
    lang: str = "cn",
) -> dict[str, Any]:
    """Fetch a newsflash list by type; "all" hits the base /v1/newsflash."""
    if type_ not in NEWSFLASH_TYPES:
        raise ValueError(f"unknown newsflash type: {type_}")
    if type_ == "all":
        path = "/v1/newsflash"
    else:
        path = f"/v1/newsflash/{type_}"
    body = _get(path, {"page": page, "size": size, "lang": lang})
    data = body.get("data") or {}
    rows = data.get("data") or []
    return {
        "status": body.get("status", 0),
        "page": data.get("page", page),
        "data": [_normalize_flash(r) for r in rows],
    }


def fetch_data(endpoint: str, **params: Any) -> dict[str, Any]:
    """Fetch one of the 11 BlockBeats data endpoints (no page/size)."""
    if endpoint not in DATA_ENDPOINTS:
        raise ValueError(f"unknown data endpoint: {endpoint}")
    body = _get(f"/v1/data/{endpoint}", params or None)
    return {
        "status": body.get("status", 0),
        "data": body.get("data"),
    }
