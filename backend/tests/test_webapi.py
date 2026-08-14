"""Offline tests for the FastAPI web API (TestClient, seeded data).

Run:
    python tests/test_webapi.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from market_data.config import Settings
from market_data.models import Series
from market_data.store import ParquetStore
from market_data.webapi import create_app

BASE = 1_700_000_000_000
STEP = 300_000


def _seed(tmp) -> Settings:  # noqa: ANN001
    settings = Settings(data_dir=Path(tmp))
    closes = np.array([100 + 5 * np.sin(i / 4) for i in range(150)], dtype="float64")
    closes[-1] = float(closes.min()) + 0.01  # park price near support
    df = pd.DataFrame({
        "open_time": [BASE + i * STEP for i in range(len(closes))],
        "open": closes, "high": closes + 0.5, "low": closes - 0.5,
        "close": closes, "volume": [1.0] * len(closes),
    })
    ParquetStore(settings.parquet_dir).save(Series("USDT-FUTURES", "BTCUSDT", "5m"), df)
    return settings


def _client(tmp) -> TestClient:  # noqa: ANN001
    return TestClient(create_app(_seed(tmp)))


def _tmp():
    return tempfile.TemporaryDirectory()


class _FakeStream:
    """Minimal stream stand-in: `latest`/`recent` return canned data."""

    def __init__(self, bar=None, bars=None) -> None:  # noqa: ANN001
        self.bar = bar
        self.bars = bars or ([bar] if bar else [])

    def latest(self, category: str, symbol: str, timeframe: str) -> dict | None:  # noqa: ARG001
        return self.bar

    def recent(self, category: str, symbol: str, timeframe: str, limit: int | None = None) -> list:  # noqa: ARG001
        return self.bars[-limit:] if limit is not None else list(self.bars)

    def start(self) -> None:
        return

    async def stop(self) -> None:
        return


class _FakeMarket:
    """Minimal market-hub stand-in for endpoint/ws tests."""

    def __init__(self) -> None:
        self.subscribed: list[tuple[str, str]] = []
        self.unsubscribed: list[tuple[str, str]] = []
        self._listeners: list = []

    def add_listener(self, listener) -> None:  # noqa: ANN001
        self._listeners.append(listener)

    def remove_listener(self, listener) -> None:  # noqa: ANN001
        if listener in self._listeners:
            self._listeners.remove(listener)

    def subscribe(self, channel: str, symbol: str) -> None:
        self.subscribed.append((channel, symbol))

    def unsubscribe(self, channel: str, symbol: str) -> None:
        self.unsubscribed.append((channel, symbol))

    def tickers(self) -> dict:
        return {"BTCUSDT": {"instId": "BTCUSDT", "lastPr": "123.4", "price24hPcnt": "-0.01"}}

    def ticker(self, symbol: str) -> dict | None:  # noqa: ARG001
        return self.tickers().get(symbol)

    def orderbook(self, symbol: str) -> dict | None:  # noqa: ARG001
        return {"asks": [(101.0, 5.0)], "bids": [(100.0, 4.0)], "seq": 10}

    def trades(self, symbol: str, limit: int | None = None) -> list:  # noqa: ARG001
        return [{"instId": symbol, "price": "1", "size": "1", "side": "buy", "ts": "1"}]

    def mark_prices(self) -> dict:
        return {"BTCUSDT": {"instId": "BTCUSDT", "markPrice": "123.0"}}

    def funding(self) -> dict:
        return {"BTCUSDT": {"instId": "BTCUSDT", "fundingRate": "0.0001"}}

    def instruments(self) -> dict:
        return {"BTCUSDT": {"symbol": "BTCUSDT", "pricePrecision": "2", "quantityPrecision": "6"}}

    def instrument(self, symbol: str) -> dict | None:  # noqa: ARG001
        return self.instruments().get(symbol)

    def start(self) -> None:
        return

    async def stop(self) -> None:
        return


# -- 8.1 core --------------------------------------------------------------
def test_health() -> None:
    with _tmp() as tmp:
        r = _client(tmp).get("/health")
        assert r.status_code == 200 and r.json()["status"] == "ok"


def test_analyze_insufficient_is_structured_error() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        r = c.get("/analyze", params={"symbol": "ETHUSDT", "timeframe": "5m"})  # no data
        assert r.status_code == 422 and "detail" in r.json()


# -- 8.2 market ------------------------------------------------------------
def test_candles_and_analyze_and_structure() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        p = {"symbol": "BTCUSDT", "timeframe": "5m"}
        assert c.get("/candles", params=p).json()["count"] > 0
        a = c.get("/analyze", params=p).json()
        assert "price" in a and isinstance(a["levels"], list)
        s = c.get("/structure", params=p).json()
        assert "swings" in s and "box" in s


# -- 8.3 config ------------------------------------------------------------
def test_config_roundtrip_and_reject() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        cfg = c.get("/config").json()
        cfg["risk"]["margin_pct"] = 0.03
        cfg["system_prompt"] = "custom prompt"
        cfg["manual_rules"] = ["never fomo"]
        assert c.put("/config", json=cfg).status_code == 200
        back = c.get("/config").json()
        assert back["risk"]["margin_pct"] == 0.03 and back["manual_rules"] == ["never fomo"]
        # invalid
        bad = c.get("/config").json()
        bad["risk"]["margin_pct"] = 2.0
        assert c.put("/config", json=bad).status_code == 400


# -- 8.3b chart config -----------------------------------------------------
def test_chart_config_roundtrip_and_reject() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        p = {"symbol": "BTCUSDT", "timeframe": "5m"}
        # missing -> empty template
        empty = c.get("/chart-config", params=p).json()
        assert empty["indicators"] == [] and empty["layers"]["sr"] is True
        # put -> get roundtrip
        state = {
            "indicators": [{"name": "MACD", "pane": "sub"}],
            "drawings": [{"name": "segment", "points": [{"timestamp": 1, "value": 100}]}],
            "layers": {"sr": True, "structure": False, "smc": True},
        }
        body = {"category": "USDT-FUTURES", "symbol": "BTCUSDT", "timeframe": "5m", "state": state}
        assert c.put("/chart-config", json=body).status_code == 200
        back = c.get("/chart-config", params=p).json()
        assert back["indicators"][0]["name"] == "MACD"
        assert back["layers"] == {"sr": True, "structure": False, "smc": True}
        # per-series isolation
        other = c.get("/chart-config", params={"symbol": "ETHUSDT", "timeframe": "5m"}).json()
        assert other["drawings"] == []
        # oversize -> 400 (ValueError handler)
        bad = dict(body)
        bad["state"] = {"indicators": [], "drawings": [{"name": "x"} for _ in range(101)], "layers": {}}
        assert c.put("/chart-config", json=bad).status_code == 400



# -- 8.4 agent -------------------------------------------------------------
def test_agent_decide_and_cycle() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        body = {"category": "USDT-FUTURES", "symbol": "BTCUSDT", "timeframe": "5m"}
        d = c.post("/agent/decide", json=body).json()
        assert d["action"] in ("open", "close", "hold")
        r = c.post("/agent/cycle", json=body).json()
        assert "status" in r
        assert c.get("/portfolio").status_code == 200


# -- 8.5 control + confirm-token flow -------------------------------------
def test_order_confirm_token_flow() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        order = {"symbol": "BTCUSDT", "side": "long", "leverage": 100.0, "price": 100.0}
        # submit -> token, no fill yet
        res = c.post("/order", json=order).json()
        assert "token" in res
        assert c.get("/portfolio").json()["positions"] == {}
        # confirm -> paper fill
        conf = c.post("/order/confirm", json={"token": res["token"]}).json()
        assert conf["filled"] and conf["live"] is False
        # token cannot be reused
        assert c.post("/order/confirm", json={"token": res["token"]}).status_code == 400


def test_kill_switch_blocks_order() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        c.put("/control", json={"kill_switch": True})
        r = c.post("/order", json={"symbol": "BTCUSDT", "side": "long", "leverage": 100.0, "price": 100.0})
        assert r.status_code == 403


def test_order_risk_rejection_no_token() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        # fill the whole margin cap first
        t = c.post("/order", json={"symbol": "ETHUSDT", "side": "long", "leverage": 100.0, "price": 100.0}).json()["token"]
        c.post("/order/confirm", json={"token": t})
        # now BTC order should be risk-rejected (no room) -> 400, no token
        r = c.post("/order", json={"symbol": "BTCUSDT", "side": "long", "leverage": 100.0, "price": 100.0})
        assert r.status_code == 400 and "token" not in r.json()


# -- 8.6 backtest job ------------------------------------------------------
def test_backtest_job() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        job = c.post("/backtest", json={"symbol": "BTCUSDT", "timeframe": "5m"}).json()
        assert "job_id" in job
        # TestClient runs background tasks synchronously after response.
        status = c.get(f"/jobs/{job['job_id']}").json()
        assert status["status"] in ("done", "running", "error")


# -- 8.7 websocket subscription protocol ---------------------------------
def test_ws_candle_subscribe() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [
                {"channel": "candle", "symbol": "BTCUSDT", "timeframe": "5m"}]})
            # first message is the candle snapshot
            msg = ws.receive_json()
            assert msg["channel"] == "candle" and msg["action"] == "snapshot"
            assert "price" in msg["data"] and "portfolio" in msg["data"]
            # subscription ack
            ack = ws.receive_json()
            assert ack["event"] == "subscribed"


def test_ws_books_subscribe_and_unsubscribe() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        market = _FakeMarket()
        c = TestClient(create_app(settings, stream=_FakeStream(None), market=market))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [{"channel": "books", "symbol": "BTCUSDT"}]})
            # snapshot then ack
            snap = ws.receive_json()
            assert snap["channel"] == "books" and snap["action"] == "snapshot"
            assert snap["data"]["asks"] == [[101.0, 5.0]]
            assert ws.receive_json()["event"] == "subscribed"
            assert ("books", "BTCUSDT") in market.subscribed
            ws.send_json({"op": "unsubscribe", "args": [{"channel": "books", "symbol": "BTCUSDT"}]})
            assert ws.receive_json()["event"] == "unsubscribed"
            assert ("books", "BTCUSDT") in market.unsubscribed


def test_ws_ticker_subscribe() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        market = _FakeMarket()
        c = TestClient(create_app(settings, stream=_FakeStream(None), market=market))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [{"channel": "ticker"}]})
            snap = ws.receive_json()
            assert snap["channel"] == "ticker" and snap["action"] == "snapshot"
            assert "BTCUSDT" in snap["data"]
            # full-market ticker is served from the REST mirror; no per-symbol WS subscribe
            assert market.subscribed == []


def test_ws_disconnect_releases_subscriptions() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        market = _FakeMarket()
        c = TestClient(create_app(settings, stream=_FakeStream(None), market=market))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [{"channel": "books", "symbol": "BTCUSDT"}]})
            ws.receive_json()
            ws.receive_json()
        assert ("books", "BTCUSDT") in market.unsubscribed
        # server survives: a fresh connection still works
        with c.websocket_connect("/ws") as ws2:
            ws2.send_json({"op": "subscribe", "args": [{"channel": "candle",
                                                        "symbol": "BTCUSDT", "timeframe": "5m"}]})
            assert ws2.receive_json()["channel"] == "candle"


# -- 8.8 exchange hub REST endpoints --------------------------------------
def test_rest_snapshot_endpoints() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        market = _FakeMarket()
        c = TestClient(create_app(settings, stream=_FakeStream(None), market=market))
        assert c.get("/tickers").json()["tickers"][0]["lastPr"] == "123.4"
        book = c.get("/books/BTCUSDT").json()
        assert book["asks"] == [[101.0, 5.0]] and book["seq"] == 10
        trades = c.get("/trades/BTCUSDT").json()["trades"]
        assert trades[0]["side"] == "buy"
        assert c.get("/funding").json()["funding"][0]["fundingRate"] == "0.0001"
        assert c.get("/mark-price").json()["mark_prices"][0]["markPrice"] == "123.0"
        insts = c.get("/instruments").json()["instruments"]
        assert insts[0]["pricePrecision"] == "2"


def test_books_empty_when_not_subscribed() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)

        class _Empty(_FakeMarket):
            def orderbook(self, symbol: str) -> dict | None:  # noqa: ARG001
                return None

            def trades(self, symbol: str, limit: int | None = None) -> list:  # noqa: ARG001
                return []

        c = TestClient(create_app(settings, stream=_FakeStream(None), market=_Empty()))
        book = c.get("/books/ETHUSDT").json()
        assert book["asks"] == [] and book["bids"] == [] and book["seq"] is None
        assert c.get("/trades/ETHUSDT").json()["trades"] == []


def test_candles_recent_returns_stream_batch() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        bars = [
            {"open_time": 1700000000000, "open": 1.0, "high": 2.0, "low": 0.0, "close": 1.5, "volume": 1.0},
            {"open_time": 1700000300000, "open": 1.5, "high": 3.0, "low": 1.0, "close": 2.5, "volume": 2.0},
        ]
        app = create_app(settings, stream=_FakeStream(bars=bars))
        c = TestClient(app)
        r = c.get("/candles/recent", params={"symbol": "ETHUSDT", "timeframe": "5m"}).json()
        assert r["count"] == 2
        assert r["candles"][-1]["close"] == 2.5
        assert r["series"] == "USDT-FUTURES/ETHUSDT/5m"


def test_candles_recent_empty_when_no_stream_data() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        app = create_app(settings, stream=_FakeStream(None))
        c = TestClient(app)
        r = c.get("/candles/recent", params={"symbol": "ETHUSDT", "timeframe": "5m"}).json()
        assert r["count"] == 0 and r["candles"] == []


def test_journal_endpoint() -> None:
    from market_data.memory import TradeJournal, TradeRecord

    with _tmp() as tmp:
        settings = _seed(tmp)
        journal = TradeJournal(settings.data_dir / "memory" / "trades.jsonl")
        journal.append(TradeRecord(
            id="x1", symbol="BTCUSDT", timeframe="5m", side="long",
            entry_price=100.0, exit_price=101.0, notional=5000.0, margin=50.0,
            leverage=100.0, pnl=50.0, opened_at=1, closed_at=2, reflection="win"))
        c = TestClient(create_app(settings))
        trades = c.get("/journal").json()["trades"]
        assert any(t["id"] == "x1" and t["pnl"] == 50.0 for t in trades)


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All webapi tests passed.")


if __name__ == "__main__":
    _run_all()
