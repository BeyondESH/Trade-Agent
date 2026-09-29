"""L2 live API tests: real HTTP against a spawned uvicorn process.

Covers the full REST surface (success + error paths) against `live_server`.
Tests that need external network (Bitget REST, BlockBeats) are marked
`online` and run only with `--run-online`.
"""

from __future__ import annotations

import httpx
import pytest

pytestmark = pytest.mark.live

CAT = "USDT-FUTURES"


@pytest.fixture(scope="module")
def client(live_server: str) -> httpx.Client:
    return httpx.Client(base_url=live_server, timeout=15.0)


def _series_qs(symbol: str = "BTCUSDT", timeframe: str = "1m") -> str:
    return f"?category={CAT}&symbol={symbol}&timeframe={timeframe}"


# -- core ---------------------------------------------------------------


def test_health(client: httpx.Client) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_candles_seeded(client: httpx.Client) -> None:
    r = client.get("/candles" + _series_qs("BTCUSDT", "1m"))
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 120
    assert len(body["candles"]) == 120
    first = body["candles"][0]
    for field in ("open_time", "open", "high", "low", "close", "volume"):
        assert field in first


def test_candles_recent(client: httpx.Client) -> None:
    r = client.get("/candles/recent" + _series_qs("BTCUSDT", "1h") + "&limit=10")
    assert r.status_code == 200
    body = r.json()
    assert 0 < body["count"] <= 10
    assert len(body["candles"]) == body["count"]


def test_analyze(client: httpx.Client) -> None:
    r = client.get("/analyze" + _series_qs("BTCUSDT", "1m"))
    assert r.status_code == 200
    body = r.json()
    assert "price" in body and "indicators" in body


def test_levels(client: httpx.Client) -> None:
    r = client.get("/levels" + _series_qs("BTCUSDT", "1m"))
    assert r.status_code == 200
    assert isinstance(r.json()["levels"], list)


def test_structure(client: httpx.Client) -> None:
    r = client.get("/structure" + _series_qs("BTCUSDT", "1m"))
    assert r.status_code == 200
    body = r.json()
    assert "swings" in body and "order_blocks" in body


# -- market channels (offline: empty but structured) ---------------------


def test_tickers_offline_structured(client: httpx.Client) -> None:
    r = client.get("/tickers")
    assert r.status_code == 200
    assert isinstance(r.json().get("tickers", []), list)


def test_books_offline_structured(client: httpx.Client) -> None:
    r = client.get(f"/books/{CAT}/BTCUSDT")
    assert r.status_code == 200
    body = r.json()
    assert body["symbol"] == "BTCUSDT"
    assert isinstance(body["asks"], list) and isinstance(body["bids"], list)


def test_trades_offline_structured(client: httpx.Client) -> None:
    r = client.get(f"/trades/{CAT}/BTCUSDT")
    assert r.status_code == 200
    assert isinstance(r.json().get("trades", []), list)


def test_funding_offline_structured(client: httpx.Client) -> None:
    r = client.get("/funding")
    assert r.status_code == 200
    assert isinstance(r.json().get("funding", []), list)


def test_mark_price_offline_structured(client: httpx.Client) -> None:
    r = client.get("/mark-price")
    assert r.status_code == 200
    assert isinstance(r.json().get("mark_prices", []), list)


def test_instruments_offline_structured(client: httpx.Client) -> None:
    r = client.get("/instruments")
    assert r.status_code == 200
    assert isinstance(r.json().get("instruments", []), list)


# -- config / chart-config ----------------------------------------------


def test_chart_config_roundtrip(client: httpx.Client) -> None:
    r = client.get("/chart-config" + _series_qs("BTCUSDT", "1h"))
    assert r.status_code == 200
    assert isinstance(r.json()["indicators"], list)

    state = {
        "indicators": [{"name": "MACD", "pane": "sub"}],
        "drawings": [],
        "layers": {"sr": True},
    }
    r = client.put(
        "/chart-config",
        json={"category": CAT, "symbol": "BTCUSDT", "timeframe": "1h", "state": state},
    )
    assert r.status_code == 200
    r = client.get("/chart-config" + _series_qs("BTCUSDT", "1h"))
    assert r.json()["indicators"] == state["indicators"]


# -- alerts CRUD --------------------------------------------------------


def test_alerts_crud(client: httpx.Client) -> None:
    r = client.post(
        "/alerts", json={"symbol": "BTCUSDT", "condition": "above", "threshold": 70000.0}
    )
    assert r.status_code == 200
    alert = r.json()["alert"]
    alert_id = alert["id"]

    r = client.get("/alerts")
    assert r.status_code == 200
    assert any(a["id"] == alert_id for a in r.json()["alerts"])

    r = client.put(f"/alerts/{alert_id}", json={"threshold": 71000.0})
    assert r.status_code == 200
    assert r.json()["alert"]["threshold"] == 71000.0

    r = client.delete(f"/alerts/{alert_id}")
    assert r.status_code == 200
    assert r.json()["ok"] is True

    r = client.get("/alerts")
    assert not any(a["id"] == alert_id for a in r.json()["alerts"])


def test_alerts_delete_missing(client: httpx.Client) -> None:
    r = client.delete("/alerts/nonexistent-id")
    assert r.status_code in (404, 405)  # route vs business layer ordering


# -- error paths --------------------------------------------------------


def test_invalid_timeframe_lenient(client: httpx.Client) -> None:
    """V1 finding: unknown timeframe returns 200 with empty candles, not 400."""
    r = client.get("/candles" + _series_qs("BTCUSDT", "xyz"))
    assert r.status_code == 200
    assert r.json()["count"] == 0


def test_invalid_category_lenient(client: httpx.Client) -> None:
    r = client.get("/candles?category=BADCAT&symbol=BTCUSDT&timeframe=1m")
    assert r.status_code == 200
    assert r.json()["count"] == 0


def test_limit_overflow_rejected(client: httpx.Client) -> None:
    r = client.get("/candles/recent" + _series_qs("BTCUSDT", "1m") + "&limit=99999")
    assert r.status_code == 422


def test_unknown_symbol_empty(client: httpx.Client) -> None:
    r = client.get("/candles" + _series_qs("NOPE", "1m"))
    assert r.status_code == 200
    assert r.json()["count"] == 0


# -- blockbeats (online: real upstream; offline: local cache) -----------


@pytest.mark.online
def test_blockbeats_data_online(client: httpx.Client) -> None:
    r = client.get("/blockbeats/data/us10y")
    assert r.status_code == 200
    assert "status" in r.json()


@pytest.mark.online
def test_blockbeats_news_online(client: httpx.Client) -> None:
    r = client.get("/blockbeats/newsflash/important")
    assert r.status_code == 200
    assert isinstance(r.json().get("data"), list)


# -- agent research / execution projections (read-only) -----------------


def test_research_proposals_list(client: httpx.Client) -> None:
    r = client.get("/research/proposals")
    assert r.status_code == 200
    proposals = r.json()["proposals"]
    assert isinstance(proposals, list)
    seeded = next(p for p in proposals if p["proposal_id"] == "seed-p1")
    assert seeded["symbol"] == "BTCUSDT"
    assert "rationale" not in seeded  # list view is trimmed to meta


def test_research_proposals_symbol_filter(client: httpx.Client) -> None:
    r = client.get("/research/proposals", params={"symbol": "BTCUSDT"})
    assert r.status_code == 200
    assert all(p["symbol"] == "BTCUSDT" for p in r.json()["proposals"])


def test_research_proposal_detail_and_404(client: httpx.Client) -> None:
    r = client.get("/research/proposals/seed-p1")
    assert r.status_code == 200
    assert r.json()["proposal_id"] == "seed-p1"

    missing = client.get("/research/proposals/nope")
    assert missing.status_code == 404


def test_execution_run_detail_and_404(client: httpx.Client) -> None:
    r = client.get("/executions/exec:seed-p1")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

    missing = client.get("/executions/nope")
    assert missing.status_code == 404


def test_research_stream_sse_and_404(client: httpx.Client) -> None:
    with client.stream("GET", "/research/research:seed/stream") as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        lines = [line for line in r.iter_lines() if line]
    assert any("done" in line for line in lines)

    missing = client.get("/research/missing:thread/stream")
    assert missing.status_code == 404


# -- live backfill (online: real Bitget v3) -----------------------------


@pytest.mark.online
def test_backfill_online(client: httpx.Client, bitget_reachable: bool) -> None:
    if not bitget_reachable:
        pytest.skip("Bitget REST unreachable")
    r = client.post(
        "/candles/backfill",
        json={"category": CAT, "symbol": "BTCUSDT", "timeframe": "1m", "before": 1_700_000_000_000},
    )
    assert r.status_code == 200
    body = r.json()
    assert "appended" in body and "earliest_reached" in body
