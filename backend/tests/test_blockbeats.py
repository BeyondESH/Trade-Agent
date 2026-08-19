"""Offline tests for the BlockBeats news/data proxy routes.

Run:
    python tests/test_blockbeats.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from market_data import blockbeats, blockbeats_cache
from market_data.config import Settings
from market_data.webapi import create_app


def _client(monkeypatch=None) -> TestClient:
    settings = Settings(data_dir=Path(tempfile.mkdtemp()))
    if monkeypatch is not None:
        # Isolate the cache dir so proxy tests always miss cache and hit the
        # monkeypatched upstream deterministically.
        monkeypatch.setattr(blockbeats_cache, "get_settings", lambda: settings)
    return TestClient(create_app(settings), raise_server_exceptions=False)


def test_data_proxy_forwards_with_api_key(monkeypatch) -> None:
    """GET /blockbeats/data/dxy proxies with the api-key header."""
    calls: list[tuple[str, dict | None]] = []

    def fake_get(path: str, params: dict | None = None) -> dict:
        calls.append((path, params))
        return {"status": 0, "data": {"value": 103.5}}

    monkeypatch.setattr(blockbeats, "_get", fake_get)
    monkeypatch.setenv("BB_API_KEY", "test-key-123")

    resp = _client(monkeypatch).get("/blockbeats/data/dxy")
    assert resp.status_code == 200
    assert resp.json()["data"] == {"value": 103.5}
    assert calls == [("/v1/data/dxy", None)]


def test_bb_api_key_reads_from_settings(monkeypatch) -> None:
    """The key resolves through the Settings chain (env / .env), not os.environ."""
    monkeypatch.delenv("BB_API_KEY", raising=False)
    monkeypatch.delenv("MD_BB_API_KEY", raising=False)
    from market_data.config import Settings

    s = Settings(bb_api_key="from-settings")
    assert s.bb_api_key == "from-settings"


def test_bb_api_key_unsupported_env_falls_back_to_md_prefix(monkeypatch) -> None:
    monkeypatch.delenv("BB_API_KEY", raising=False)
    monkeypatch.setenv("MD_BB_API_KEY", "md-key")
    from market_data.config import Settings

    s = Settings()
    assert s.bb_api_key == "md-key"


def test_data_proxy_network_param(monkeypatch) -> None:
    calls: list[tuple[str, dict | None]] = []

    def fake_get(path: str, params: dict | None = None) -> dict:
        calls.append((path, params))
        return {"status": 0, "data": []}

    monkeypatch.setattr(blockbeats, "_get", fake_get)
    monkeypatch.setenv("BB_API_KEY", "test-key-123")

    resp = _client(monkeypatch).get("/blockbeats/data/top10_netflow", params={"network": "solana"})
    assert resp.status_code == 200
    assert calls == [("/v1/data/top10_netflow", {"network": "solana"})]


def test_data_proxy_us10y_endpoint_name(monkeypatch) -> None:
    """The endpoint name matches the upstream doc exactly (/v1/data/us10y)."""
    calls: list[tuple[str, dict | None]] = []

    def fake_get(path: str, params: dict | None = None) -> dict:
        calls.append((path, params))
        return {"status": 0, "data": []}

    monkeypatch.setattr(blockbeats, "_get", fake_get)
    monkeypatch.setenv("BB_API_KEY", "test-key-123")

    resp = _client(monkeypatch).get("/blockbeats/data/us10y")
    assert resp.status_code == 200
    assert calls == [("/v1/data/us10y", None)]


def test_data_proxy_type_param(monkeypatch) -> None:
    """`type` is forwarded only when explicitly provided."""
    calls: list[tuple[str, dict | None]] = []

    def fake_get(path: str, params: dict | None = None) -> dict:
        calls.append((path, params))
        return {"status": 0, "data": []}

    monkeypatch.setattr(blockbeats, "_get", fake_get)
    monkeypatch.setenv("BB_API_KEY", "test-key-123")

    resp = _client(monkeypatch).get("/blockbeats/data/dxy", params={"type": "1M"})
    assert resp.status_code == 200
    assert calls == [("/v1/data/dxy", {"type": "1M"})]

    resp = _client(monkeypatch).get("/blockbeats/data/dxy")
    assert resp.status_code == 200
    assert calls == [("/v1/data/dxy", {"type": "1M"}), ("/v1/data/dxy", None)]


def test_data_proxy_old_endpoint_name_400(monkeypatch) -> None:
    """Legacy endpoint names are rejected now that names match upstream."""
    monkeypatch.setenv("BB_API_KEY", "test-key-123")
    resp = _client(monkeypatch).get("/blockbeats/data/daily_volume")
    assert resp.status_code == 400


def test_data_proxy_unknown_endpoint_400(monkeypatch) -> None:
    monkeypatch.setenv("BB_API_KEY", "test-key-123")
    resp = _client(monkeypatch).get("/blockbeats/data/not_an_endpoint")
    assert resp.status_code == 400


def test_data_proxy_upstream_error_502(monkeypatch) -> None:
    def fake_get(path: str, params: dict | None = None) -> dict:  # noqa: ARG001
        raise RuntimeError("upstream down")

    monkeypatch.setattr(blockbeats, "_get", fake_get)
    monkeypatch.setenv("BB_API_KEY", "test-key-123")

    resp = _client(monkeypatch).get("/blockbeats/data/dxy")
    assert resp.status_code == 502


def test_newsflash_proxy_whitelist_and_forward(monkeypatch) -> None:
    calls: list[tuple[str, dict | None]] = []

    def fake_get(path: str, params: dict | None = None) -> dict:
        calls.append((path, params))
        return {"status": 0, "data": {"data": [{"id": 1, "title": "t", "content": "<p>c</p>", "create_time": 1769677313}]}}

    monkeypatch.setattr(blockbeats, "_get", fake_get)
    monkeypatch.setenv("BB_API_KEY", "test-key-123")

    resp = _client(monkeypatch).get("/blockbeats/newsflash/ai", params={"page": 1, "size": 10, "lang": "cn"})
    assert resp.status_code == 200
    assert calls == [("/v1/newsflash/ai", {"page": 1, "size": 10, "lang": "cn"})]
    # epoch create_time is normalized server-side
    assert resp.json()["data"][0]["create_time"] == 1769677313


def test_newsflash_proxy_unknown_type_400(monkeypatch) -> None:
    monkeypatch.setenv("BB_API_KEY", "test-key-123")
    resp = _client(monkeypatch).get("/blockbeats/newsflash/bogus")
    assert resp.status_code == 400


if __name__ == "__main__":
    import sys

    import pytest

    sys.exit(pytest.main([__file__, "-v"]))
