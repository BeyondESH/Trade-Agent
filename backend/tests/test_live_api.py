"""L2 live API tests: real HTTP against a spawned uvicorn process.

Covers the full REST surface (success + error paths) against `live_server`.
Tests that need external network (Bitget REST, BlockBeats) are marked
`online` and run only with `--run-online`.
"""

from __future__ import annotations

import httpx
import pytest

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
    body = r.json()
    assert body["status"] == "ok"
    assert "kill_switch" in body and "live_enabled" in body


def test_portfolio_empty(client: httpx.Client) -> None:
    r = client.get("/portfolio")
    assert r.status_code == 200
    body = r.json()
    assert body["equity"] == 1000.0
    assert body["positions"] == {}


def test_journal_empty(client: httpx.Client) -> None:
    r = client.get("/journal")
    assert r.status_code == 200
    assert r.json()["trades"] == []


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


def test_backtest_and_job(client: httpx.Client) -> None:
    r = client.post("/backtest", json={"category": CAT, "symbol": "BTCUSDT", "timeframe": "1m"})
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    jr = client.get(f"/jobs/{job_id}")
    assert jr.status_code == 200
    assert jr.json()["job_id"] == job_id


def test_job_not_found(client: httpx.Client) -> None:
    r = client.get("/jobs/does-not-exist")
    assert r.status_code == 404


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

def test_config_roundtrip(client: httpx.Client) -> None:
    r = client.get("/config")
    assert r.status_code == 200
    cfg = r.json()
    assert cfg["provider"]["kind"] == "rule"

    cfg["provider"]["near_pct"] = 0.007
    r = client.put("/config", json=cfg)
    assert r.status_code == 200
    assert r.json()["provider"]["near_pct"] == 0.007

    r = client.get("/config")
    assert r.json()["provider"]["near_pct"] == 0.007


def test_config_invalid_rejected(client: httpx.Client) -> None:
    r = client.put("/config", json={"risk": {"max_leverage": 0}})
    assert r.status_code == 400


def test_chart_config_roundtrip(client: httpx.Client) -> None:
    r = client.get("/chart-config" + _series_qs("BTCUSDT", "1h"))
    assert r.status_code == 200
    assert isinstance(r.json()["indicators"], list)

    state = {"indicators": [{"name": "MACD", "pane": "sub"}], "drawings": [], "layers": {"sr": True}}
    r = client.put("/chart-config", json={"category": CAT, "symbol": "BTCUSDT",
                                          "timeframe": "1h", "state": state})
    assert r.status_code == 200
    r = client.get("/chart-config" + _series_qs("BTCUSDT", "1h"))
    assert r.json()["indicators"] == state["indicators"]


# -- alerts CRUD --------------------------------------------------------

def test_alerts_crud(client: httpx.Client) -> None:
    r = client.post("/alerts", json={"symbol": "BTCUSDT", "condition": "above", "threshold": 70000.0})
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


# -- order flow ---------------------------------------------------------

def test_order_confirm_token_flow(client: httpx.Client) -> None:
    # The session-scoped live server shares portfolio state across tests;
    # skip the fill assertions if an earlier agent test consumed the margin
    # so this test never depends on a specific execution order.
    r = client.get("/portfolio")
    positions = r.json()["positions"]
    if positions:
        pytest.skip(f"portfolio already holds {list(positions)}; skip order-fill assertions")

    r = client.post("/order", json={"category": CAT, "symbol": "SOLUSDT", "side": "long",
                                    "leverage": 10, "price": 100.0})
    assert r.status_code == 200, f"order failed: {r.status_code} {r.text}"
    body = r.json()
    assert "token" in body and "preview" in body

    r = client.post("/order/confirm", json={"token": body["token"]})
    assert r.status_code == 200
    confirm = r.json()
    assert confirm["approved"] is True
    assert confirm["filled"] is True
    assert confirm["live"] is False  # paper-only default

    # portfolio now reflects the position
    r = client.get("/portfolio")
    assert "SOLUSDT" in r.json()["positions"]


def test_order_confirm_unknown_token(client: httpx.Client) -> None:
    r = client.post("/order/confirm", json={"token": "not-a-real-token"})
    assert r.status_code == 400


def test_order_kill_switch_blocked(client: httpx.Client) -> None:
    client.put("/control", json={"kill_switch": True})
    try:
        r = client.post("/order", json={"category": CAT, "symbol": "BTCUSDT", "side": "long",
                                        "leverage": 10, "price": 100.0})
        assert r.status_code == 403
    finally:
        client.put("/control", json={"kill_switch": False})


# -- agent / portfolio / journal / control ------------------------------

def test_agent_decide_rule_based(client: httpx.Client) -> None:
    r = client.post("/agent/decide", json={"category": CAT, "symbol": "BTCUSDT", "timeframe": "1h"})
    assert r.status_code == 200
    body = r.json()
    assert body["action"] in ("open", "close", "hold")
    assert "symbol" in body and "reason" in body


def test_agent_cycle(client: httpx.Client) -> None:
    r = client.post("/agent/cycle", json={"category": CAT, "symbol": "ETHUSDT", "timeframe": "1h"})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, dict) and "decision" in body


def test_agent_insufficient_data(client: httpx.Client) -> None:
    r = client.post("/agent/decide", json={"category": CAT, "symbol": "SOLUSDT", "timeframe": "1h"})
    # seed only has 48 bars -> should be >= 30, so 200; use a fresh symbol to force < 30
    r = client.post("/agent/decide", json={"category": CAT, "symbol": "NEWSYM", "timeframe": "1h"})
    assert r.status_code == 422


def test_control_roundtrip(client: httpx.Client) -> None:
    r = client.put("/control", json={"kill_switch": True})
    assert r.status_code == 200
    assert r.json()["kill_switch"] is True
    r = client.put("/control", json={"kill_switch": False})
    assert r.json()["kill_switch"] is False


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


# -- live backfill (online: real Bitget v3) -----------------------------

@pytest.mark.online
def test_backfill_online(client: httpx.Client, bitget_reachable: bool) -> None:
    if not bitget_reachable:
        pytest.skip("Bitget REST unreachable")
    r = client.post("/candles/backfill", json={"category": CAT, "symbol": "BTCUSDT",
                                               "timeframe": "1m", "before": 1_700_000_000_000})
    assert r.status_code == 200
    body = r.json()
    assert "appended" in body and "earliest_reached" in body
