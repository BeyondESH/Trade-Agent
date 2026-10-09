"""Server-side cache for BlockBeats daily data endpoints (PostgreSQL).

BlockBeats ``/v1/data/*`` snapshots only change daily; fetching them on every
frontend request is slow and wasteful. This module persists each endpoint's
response ``data`` and lets the web API serve from cache, falling back to a live
fetch only on a cache miss (e.g. an unusual parameter combination). The API key
never leaves the server side - the same ``blockbeats.fetch_data`` (which reads
``Settings.bb_api_key``) is reused.

Phase 1 of the JSON -> PostgreSQL migration: instead of one JSON file per
``<endpoint>[.<param>]`` combination, each combination is one row in
``blockbeats_cache`` keyed by its former file stem (``cache_key``). The payload
stays opaque and lives in ``jsonb``; the same ``refresh_all`` isolation
semantics apply (a failing endpoint keeps its previous row).

The former ``save_cache`` wrote atomically (temp file + ``os.replace``); the DB
upsert preserves that "a failed write never corrupts the existing cache value"
guarantee.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from psycopg.types.json import Jsonb

from market_data import blockbeats
from market_data.blockbeats import DATA_ENDPOINTS
from market_data.config import get_settings
from market_data.db import Database, get_database

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


# Module-level override so the FastAPI app (and tests) can share their Database.
_override: Database | None = None


def configure_database(database: Database | None) -> None:
    """Bind the cache to a specific `Database` (used by `create_app` and tests)."""
    global _override
    _override = database


def _db() -> Database:
    return _override or get_database()


def cache_key(endpoint: str, network: str | None = None, type: str | None = None) -> str:
    """The canonical cache key for an (endpoint, param) combination.

    Mirrors the former cache filename stem: ``<endpoint>[.<network>][.<type>]``.
    """
    parts: list[str] = [endpoint]
    if network is not None:
        parts.append(network)
    if type is not None:
        parts.append(type)
    return ".".join(parts)


def cache_dir() -> Path:
    """The (legacy) blockbeats cache directory, kept for API compatibility."""
    d = get_settings().blockbeats_cache_dir
    d.mkdir(parents=True, exist_ok=True)
    return d


def path_for(endpoint: str, network: str | None = None, type: str | None = None) -> Path:
    """Legacy file path for a cache key, kept for API/call-site compatibility.

    The cache no longer writes files; this only computes the historical path.
    """
    return cache_dir() / f"{cache_key(endpoint, network, type)}.json"


def has_cache() -> bool:
    """Whether any cache rows exist, i.e. a previous run already populated it."""
    with _db().connection() as conn:
        row = conn.execute("SELECT EXISTS (SELECT 1 FROM blockbeats_cache) AS present").fetchone()
    return bool(row["present"])


def load_cache(endpoint: str, network: str | None = None, type: str | None = None) -> dict | None:
    """Return ``{"fetched_at", "data"}`` for a cached endpoint, or None on miss."""
    key = cache_key(endpoint, network, type)
    with _db().connection() as conn:
        row = conn.execute(
            "SELECT fetched_at, data FROM blockbeats_cache WHERE cache_key = %s", (key,)
        ).fetchone()
    if row is None:
        return None
    fetched_at = row["fetched_at"]
    if isinstance(fetched_at, datetime):
        fetched_at = fetched_at.astimezone(UTC).isoformat()
    return {"fetched_at": fetched_at, "data": row["data"]}


def save_cache(
    endpoint: str, data: Any, network: str | None = None, type: str | None = None
) -> str:
    """Upsert ``data`` for an endpoint; returns the ``cache_key``.

    A failed write never corrupts an existing cache value (row-level upsert).
    """
    key = cache_key(endpoint, network, type)
    with _db().connection() as conn:
        conn.execute(
            "INSERT INTO blockbeats_cache "
            "(cache_key, endpoint, network, type, fetched_at, data) "
            "VALUES (%s, %s, %s, %s, %s, %s) "
            "ON CONFLICT (cache_key) DO UPDATE SET "
            "endpoint = EXCLUDED.endpoint, network = EXCLUDED.network, "
            "type = EXCLUDED.type, fetched_at = EXCLUDED.fetched_at, "
            "data = EXCLUDED.data",
            (key, endpoint, network, type, datetime.now(UTC), Jsonb(data)),
        )
    return key


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
    """Fetch every cached endpoint combination and write it to the cache.

    Single-endpoint failures are isolated and never abort the rest. Returns a
    summary ``{cache_key: "ok" | "error"}`` keyed by the cache key.
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
