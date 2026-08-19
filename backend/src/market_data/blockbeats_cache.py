"""Server-side cache for BlockBeats daily data endpoints.

BlockBeats `/v1/data/*` snapshots only change daily; fetching them on every
frontend request is slow and wasteful. This module persists each endpoint's
response `data` to a small JSON file under `data_dir/blockbeats_cache/` and lets
the web API serve from cache, falling back to a live fetch only on a cache
miss (e.g. an unusual parameter combination). The API key never leaves the
server side — the same `blockbeats.fetch_data` (which reads `Settings.bb_api_key`)
is reused.

Cache file layout: `<cache_dir>/<endpoint>[.<param>].json`, e.g.
- `btc_etf.json`, `daily_tx.json`          (no-param endpoints)
- `top10_netflow.solana.json`              (network param)
- `us10y.1M.json`, `dxy.1M.json`           (type param, default 1M)

Each file holds `{"fetched_at": "<UTC iso>", "data": <payload>}`.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from market_data import blockbeats
from market_data.blockbeats import DATA_ENDPOINTS
from market_data.config import get_settings

logger = logging.getLogger(__name__)

# Endpoints that take the upstream `network` query param (top10_netflow).
NETWORK_END_POINTS = ("top10_netflow",)

# Endpoints that take the upstream `type` query param; the default granularity
# we pre-cache for us10y/dxy is 1M (single month of K-lines).
TYPE_END_POINTS = ("us10y", "dxy")
DEFAULT_TYPE = "1M"

# Networks pre-cached for top10_netflow. Mirrors the frontend selector range.
NETFLOW_NETWORKS = ("solana", "ethereum", "base", "bsc", "arbitrum", "ton")

# No-param endpoints = all DATA_ENDPOINTS minus the param-bearing ones above.
NO_PARAM_END_POINTS = tuple(
    e for e in DATA_ENDPOINTS if e not in NETWORK_END_POINTS and e not in TYPE_END_POINTS
)


def cache_dir() -> Path:
    """The blockbeats cache directory, creating it if needed."""
    d = get_settings().blockbeats_cache_dir
    d.mkdir(parents=True, exist_ok=True)
    return d


def has_cache() -> bool:
    """Whether any cache files exist, i.e. a previous run already populated it."""
    d = get_settings().blockbeats_cache_dir
    if not d.is_dir():
        return False
    return any(d.glob("*.json"))


def path_for(endpoint: str, network: str | None = None, type: str | None = None) -> Path:
    """Resolve the cache file path for an (endpoint, param) combination."""
    parts: list[str] = [endpoint]
    if network is not None:
        parts.append(network)
    if type is not None:
        parts.append(type)
    return cache_dir() / f"{'.'.join(parts)}.json"


def load_cache(endpoint: str, network: str | None = None, type: str | None = None) -> dict | None:
    """Return `{"fetched_at", "data"}` for a cached endpoint, or None on miss/corruption."""
    p = path_for(endpoint, network, type)
    try:
        with open(p, "r", encoding="utf-8") as f:
            obj = json.load(f)
        if not isinstance(obj, dict) or "data" not in obj:
            return None
        return obj
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def save_cache(endpoint: str, data: Any, network: str | None = None, type: str | None = None) -> Path:
    """Persist `data` for an endpoint; atomic write via temp file + rename.

    Returns the written path. Raises OSError on write failure, but a failed
    write never corrupts an existing cache file (rename replaces atomically).
    """
    p = path_for(endpoint, network, type)
    obj = {"fetched_at": datetime.now(timezone.utc).isoformat(), "data": data}
    fd, tmp = tempfile.mkstemp(dir=str(p.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False)
        os.replace(tmp, str(p))
    except Exception:
        # Best-effort cleanup of the temp file on any failure.
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return p


def _write_for(endpoint: str, network: str | None = None, type: str | None = None) -> bool:
    """Fetch one endpoint and write it to cache. Returns success."""
    try:
        params: dict[str, str] = {}
        if network is not None:
            params["network"] = network
        if type is not None:
            params["type"] = type
        body = blockbeats.fetch_data(endpoint, **params)
        save_cache(endpoint, body.get("data"), network=network, type=type)
        return True
    except Exception:  # noqa: BLE001 - per-endpoint isolation during refresh
        logger.warning("BlockBeats cache refresh failed for %s", endpoint, exc_info=True)
        return False


def refresh_all() -> dict[str, str]:
    """Fetch every cached endpoint combination and write it to disk.

    Single-endpoint failures are isolated and never abort the rest. Returns a
    summary `{cache_key: "ok" | "error"}` keyed by the cache file stem.
    """
    result: dict[str, str] = {}

    for ep in NO_PARAM_END_POINTS:
        result[ep] = "ok" if _write_for(ep) else "error"

    for network in NETFLOW_NETWORKS:
        key = f"top10_netflow.{network}"
        result[key] = "ok" if _write_for("top10_netflow", network=network) else "error"

    for ep in TYPE_END_POINTS:
        key = f"{ep}.{DEFAULT_TYPE}"
        result[key] = "ok" if _write_for(ep, type=DEFAULT_TYPE) else "error"

    return result
