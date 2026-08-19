"""Offline tests for the BlockBeats daily data cache.

Run:
    python tests/test_blockbeats_cache.py   # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
import pytest

import market_data.blockbeats_cache as cache
from market_data import blockbeats
from market_data.config import Settings
from market_data.webapi import create_app


@pytest.fixture()
def tmp_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Point the cache at a temp dir for the duration of a test."""
    settings = Settings(data_dir=Path(tmp_path))
    monkeypatch.setattr(cache, "get_settings", lambda: settings)
    return settings


def _make_fake_fetch(fail: set[str] | None = None):
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


def _client(settings: Settings) -> TestClient:
    return TestClient(create_app(settings), raise_server_exceptions=False)


def test_no_param_endpoints_exclude_param_bearing(tmp_settings):
    assert "btc_etf" in cache.NO_PARAM_END_POINTS
    assert "daily_tx" in cache.NO_PARAM_END_POINTS
    assert "top10_netflow" not in cache.NO_PARAM_END_POINTS
    assert "us10y" not in cache.NO_PARAM_END_POINTS
    assert "dxy" not in cache.NO_PARAM_END_POINTS


def test_path_for_names(tmp_settings):
    cache_dir = tmp_settings.blockbeats_cache_dir
    assert cache.path_for("btc_etf") == cache_dir / "btc_etf.json"
    assert cache.path_for("top10_netflow", network="solana") == cache_dir / "top10_netflow.solana.json"
    assert cache.path_for("us10y", type="1M") == cache_dir / "us10y.1M.json"


def test_save_load_roundtrip(tmp_settings):
    p = cache.save_cache("btc_etf", [{"date": "2026-01-01", "net": "1.0"}])
    assert p.exists()
    obj = cache.load_cache("btc_etf")
    assert obj is not None
    assert obj["data"] == [{"date": "2026-01-01", "net": "1.0"}]
    assert "fetched_at" in obj


def test_load_missing_and_corrupt(tmp_settings, tmp_path):
    # missing -> None
    assert cache.load_cache("nonexistent") is None
    # corrupt -> None
    p = tmp_path / "blockbeats_cache" / "corrupt.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("not json", encoding="utf-8")
    assert cache.load_cache("corrupt") is None


def test_route_serves_from_cache_hit(monkeypatch, tmp_settings):
    monkeypatch.setattr(blockbeats, "fetch_data", _make_fake_fetch())
    # Warm the cache for all endpoints.
    cache.refresh_all()

    client = _client(tmp_settings)
    resp = client.get("/blockbeats/data/btc_etf")
    assert resp.status_code == 200
    body = resp.json()
    assert body["from_cache"] is True
    assert body["data"] == [{"_fake": "btc_etf"}]
    assert "fetched_at" in body


def test_route_cache_miss_falls_back_live(monkeypatch, tmp_settings):
    calls = []

    def spy(endpoint: str, **params):
        calls.append((endpoint, params))
        return _make_fake_fetch()(endpoint, **params)

    monkeypatch.setattr(blockbeats, "fetch_data", spy)
    client = _client(tmp_settings)

    # No cache warm-up -> miss for bitfinex_long -> live call, not cached.
    resp = client.get("/blockbeats/data/bitfinex_long")
    assert resp.status_code == 200
    body = resp.json()
    assert body["from_cache"] is False
    assert ("bitfinex_long", {}) in calls


def test_route_param_bearing_cache_hit(monkeypatch, tmp_settings):
    monkeypatch.setattr(blockbeats, "fetch_data", _make_fake_fetch())
    cache.refresh_all()

    client = _client(tmp_settings)
    resp = client.get("/blockbeats/data/top10_netflow", params={"network": "solana"})
    assert resp.json()["data"] == [{"_fake": "top10_netflow.solana"}]
    assert resp.json()["from_cache"] is True

    resp = client.get("/blockbeats/data/us10y", params={"type": "1M"})
    assert resp.json()["data"] == [{"_fake": "us10y.1M"}]
    assert resp.json()["from_cache"] is True


def test_refresh_isolates_failures_keeps_old_cache(monkeypatch, tmp_settings):
    # Write a healthy btc_etf cache first.
    cache.save_cache("btc_etf", ["old-ok"])

    # Now refresh with btc_etf failing -> it must be reported error and keep old.
    monkeypatch.setattr(blockbeats, "fetch_data", _make_fake_fetch(fail={"btc_etf"}))
    result = cache.refresh_all()
    assert result["btc_etf"] == "error"
    assert cache.load_cache("btc_etf")["data"] == ["old-ok"]
    assert result["top10_netflow.solana"] == "ok"


def test_refresh_endpoint_route(monkeypatch, tmp_settings):
    monkeypatch.setattr(blockbeats, "fetch_data", _make_fake_fetch())
    client = _client(tmp_settings)
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

    import pytest as _pytest

    sys.exit(_pytest.main([__file__, "-v"]))
