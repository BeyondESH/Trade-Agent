"""Offline tests for the BlockBeats daily data cache (PostgreSQL).

Run:
    pytest tests/test_blockbeats_cache.py
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import market_data.blockbeats_cache as cache
from market_data import blockbeats
from market_data.config import Settings
from market_data.webapi import create_app

pytestmark = pytest.mark.db


def _fake_fetch(fail: set[str] | None = None):
    """A blockbeats.fetch_data fake; returns canned data, failing on `fail`."""
    fail = fail or set()

    def fake(endpoint: str, **params):
        if endpoint in fail:
            raise RuntimeError(f"upstream down: {endpoint}")
        key = endpoint
        if params.get("network"):
            key += f".{params['network']}"
        if params.get("type"):
            key += f".{params['type']}"
        return {"status": 0, "data": [{"_fake": key}]}

    return fake


def _settings(tmp_path: Path) -> Settings:
    return Settings(data_dir=Path(tmp_path))


def _client(settings: Settings, pg_db) -> TestClient:  # noqa: ANN001
    return TestClient(create_app(settings, database=pg_db), raise_server_exceptions=False)


def test_no_param_endpoints_exclude_param_bearing() -> None:
    assert "btc_etf" in cache.NO_PARAM_END_POINTS
    assert "daily_tx" in cache.NO_PARAM_END_POINTS
    assert "top10_netflow" not in cache.NO_PARAM_END_POINTS
    assert "us10y" not in cache.NO_PARAM_END_POINTS
    assert "dxy" not in cache.NO_PARAM_END_POINTS


def test_cache_key_names() -> None:
    assert cache.cache_key("btc_etf") == "btc_etf"
    assert cache.cache_key("top10_netflow", network="solana") == "top10_netflow.solana"
    assert cache.cache_key("us10y", type="1M") == "us10y.1M"


def test_save_load_roundtrip(pg_db) -> None:  # noqa: ANN001
    key = cache.save_cache("btc_etf", [{"date": "2026-01-01", "net": "1.0"}])
    assert key == "btc_etf"
    obj = cache.load_cache("btc_etf")
    assert obj is not None
    assert obj["data"] == [{"date": "2026-01-01", "net": "1.0"}]
    assert "fetched_at" in obj


def test_load_missing(pg_db) -> None:  # noqa: ANN001
    assert cache.load_cache("nonexistent") is None
    assert cache.has_cache() is False


def test_route_serves_from_cache_hit(monkeypatch, pg_db, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setattr(blockbeats, "fetch_data", _fake_fetch())
    cache.refresh_all()

    client = _client(_settings(tmp_path), pg_db)
    resp = client.get("/blockbeats/data/btc_etf")
    assert resp.status_code == 200
    body = resp.json()
    assert body["from_cache"] is True
    assert body["data"] == [{"_fake": "btc_etf"}]
    assert "fetched_at" in body


def test_route_cache_miss_falls_back_live(monkeypatch, pg_db, tmp_path) -> None:  # noqa: ANN001
    calls = []

    def spy(endpoint: str, **params):
        calls.append((endpoint, params))
        return _fake_fetch()(endpoint, **params)

    monkeypatch.setattr(blockbeats, "fetch_data", spy)
    client = _client(_settings(tmp_path), pg_db)

    resp = client.get("/blockbeats/data/bitfinex_long")
    assert resp.status_code == 200
    body = resp.json()
    assert body["from_cache"] is False
    assert ("bitfinex_long", {}) in calls


def test_route_param_bearing_cache_hit(monkeypatch, pg_db, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setattr(blockbeats, "fetch_data", _fake_fetch())
    cache.refresh_all()

    client = _client(_settings(tmp_path), pg_db)
    resp = client.get("/blockbeats/data/top10_netflow", params={"network": "solana"})
    assert resp.json()["data"] == [{"_fake": "top10_netflow.solana"}]
    assert resp.json()["from_cache"] is True

    resp = client.get("/blockbeats/data/us10y", params={"type": "1M"})
    assert resp.json()["data"] == [{"_fake": "us10y.1M"}]
    assert resp.json()["from_cache"] is True


def test_refresh_isolates_failures_keeps_old_cache(monkeypatch, pg_db) -> None:  # noqa: ANN001
    cache.save_cache("btc_etf", ["old-ok"])

    monkeypatch.setattr(blockbeats, "fetch_data", _fake_fetch(fail={"btc_etf"}))
    result = cache.refresh_all()
    assert result["btc_etf"] == "error"
    assert cache.load_cache("btc_etf")["data"] == ["old-ok"]
    assert result["top10_netflow.solana"] == "ok"


def test_refresh_endpoint_route(monkeypatch, pg_db, tmp_path) -> None:  # noqa: ANN001
    monkeypatch.setattr(blockbeats, "fetch_data", _fake_fetch())
    client = _client(_settings(tmp_path), pg_db)
    resp = client.post("/blockbeats/data/refresh")
    assert resp.status_code == 200
    body = resp.json()
    assert "refreshed_at" in body
    results = body["results"]
    assert results["btc_etf"] == "ok"
    assert results["top10_netflow.ethereum"] == "ok"
    assert results["us10y.1M"] == "ok"


if __name__ == "__main__":
    import sys

    sys.exit(pytest.main([__file__, "-v"]))
