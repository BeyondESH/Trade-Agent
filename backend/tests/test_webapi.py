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
    store = ParquetStore(settings.parquet_dir)
    store.save(Series("USDT-FUTURES", "BTCUSDT", "5m"), df)
    hour_df = pd.DataFrame({
        "open_time": [BASE + i * STEP * 12 for i in range(60)],
        "open": closes[:60], "high": closes[:60] + 0.5, "low": closes[:60] - 0.5,
        "close": closes[:60], "volume": [1.0] * 60,
    })
    store.save(Series("USDT-FUTURES", "BTCUSDT", "1h"), hour_df)
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
        self.subscribed: list[tuple[str, str, str]] = []
        self.unsubscribed: list[tuple[str, str, str]] = []
        self._listeners: dict[tuple[str, str, str], set] = {}
        self.added: list[tuple[str, str, str]] = []
        self.removed: list[tuple[str, str, str]] = []
        self._loop = None

    def latest(self, category: str, symbol: str, timeframe: str) -> dict | None:  # noqa: ARG001
        return self.bar

    def recent(self, category: str, symbol: str, timeframe: str, limit: int | None = None) -> list:  # noqa: ARG001
        return self.bars[-limit:] if limit is not None else list(self.bars)

    def subscribe(self, category: str, symbol: str, timeframe: str) -> None:
        self.subscribed.append((category, symbol, timeframe))

    def unsubscribe(self, category: str, symbol: str, timeframe: str) -> None:
        self.unsubscribed.append((category, symbol, timeframe))

    def add_listener(self, category: str, symbol: str, timeframe: str, callback) -> None:  # noqa: ANN001
        self.added.append((category, symbol, timeframe))
        self._listeners.setdefault((category, symbol, timeframe), set()).add(callback)
        if self._loop is None:
            import asyncio

            self._loop = asyncio.get_running_loop()

    def remove_listener(self, category: str, symbol: str, timeframe: str, callback) -> None:  # noqa: ANN001
        self.removed.append((category, symbol, timeframe))
        callbacks = self._listeners.get((category, symbol, timeframe))
        if callbacks:
            callbacks.discard(callback)

    def emit(self, category: str, symbol: str, timeframe: str, bar: dict) -> None:  # noqa: ANN001
        """Fake a live bar update through registered listeners (event-loop safe)."""
        for cb in list(self._listeners.get((category, symbol, timeframe), ())):
            self._loop.call_soon_threadsafe(cb, dict(bar))

    def start(self) -> None:
        return

    async def stop(self) -> None:
        return


class _FakeMarket:
    """Minimal market-hub stand-in for endpoint/ws tests."""

    def __init__(self) -> None:
        self.subscribed: list[tuple[str, str, str]] = []
        self.unsubscribed: list[tuple[str, str, str]] = []
        self._listeners: list = []
        self._loop = None

    def add_listener(self, listener) -> None:  # noqa: ANN001
        self._listeners.append(listener)
        if self._loop is None:
            import asyncio

            self._loop = asyncio.get_running_loop()

    def remove_listener(self, listener) -> None:  # noqa: ANN001
        if listener in self._listeners:
            self._listeners.remove(listener)

    def emit(self, category: str, channel: str, symbol: str, action: str, data) -> None:  # noqa: ANN001
        """Fake a market-hub frame through registered listeners (event-loop safe)."""
        for fn in list(self._listeners):
            self._loop.call_soon_threadsafe(fn, category, channel, symbol, action, data)

    def subscribe(self, channel: str, symbol: str, category: str = "USDT-FUTURES") -> None:
        self.subscribed.append((channel, symbol, category))

    def unsubscribe(self, channel: str, symbol: str, category: str = "USDT-FUTURES") -> None:
        self.unsubscribed.append((channel, symbol, category))

    def tickers(self, category: str | None = None) -> dict:  # noqa: ARG001
        return {"BTCUSDT": {"instId": "BTCUSDT", "lastPr": "123.4", "price24hPcnt": "-0.01"}}

    def ticker(self, symbol: str, category: str = "USDT-FUTURES") -> dict | None:  # noqa: ARG001
        return self.tickers().get(symbol)

    def orderbook(self, symbol: str, category: str = "USDT-FUTURES") -> dict | None:  # noqa: ARG001
        return {"asks": [(101.0, 5.0)], "bids": [(100.0, 4.0)], "seq": 10}

    def trades(self, symbol: str, limit: int | None = None, category: str = "USDT-FUTURES") -> list:  # noqa: ARG001
        return [{"instId": symbol, "price": "1", "size": "1", "side": "buy", "ts": "1"}]

    def mark_prices(self, category: str | None = None) -> dict:  # noqa: ARG001
        return {"BTCUSDT": {"instId": "BTCUSDT", "markPrice": "123.0"}}

    def funding(self, category: str | None = None) -> dict:  # noqa: ARG001
        return {"BTCUSDT": {"instId": "BTCUSDT", "fundingRate": "0.0001"}}

    def instruments(self, category: str | None = None) -> dict:  # noqa: ARG001
        return {"BTCUSDT": {"symbol": "BTCUSDT", "pricePrecision": "2", "quantityPrecision": "6"}}

    def instrument(self, symbol: str, category: str = "USDT-FUTURES") -> dict | None:  # noqa: ARG001
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


def test_timeframe_case_insensitive() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        for tf in ("1H", "1h"):
            r = c.get("/candles", params={"symbol": "BTCUSDT", "timeframe": tf})
            assert r.status_code == 200, f"timeframe={tf} failed: {r.json()}"
            assert r.json()["count"] > 0, f"timeframe={tf} returned empty"
        for tf in ("1H", "1h"):
            r = c.get("/candles/recent", params={"symbol": "BTCUSDT", "timeframe": tf})
            assert r.status_code == 200


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
        settings = _seed(tmp)
        stream = _FakeStream(None)
        c = TestClient(create_app(settings, stream=stream, market=_FakeMarket()))
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
            assert ("USDT-FUTURES", "BTCUSDT", "5m") in stream.subscribed


def test_ws_candle_dynamic_symbol_subscribe_and_unsubscribe() -> None:
    """Subscribing an unconfigured symbol drives a live stream subscribe;
    unsubscribing releases it."""
    with _tmp() as tmp:
        settings = _seed(tmp)
        stream = _FakeStream(None)
        c = TestClient(create_app(settings, stream=stream, market=_FakeMarket()))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [
                {"channel": "candle", "symbol": "XRPUSDT", "timeframe": "1h"}]})
            assert ws.receive_json()["channel"] == "candle"
            assert ws.receive_json()["event"] == "subscribed"
            assert ("USDT-FUTURES", "XRPUSDT", "1h") in stream.subscribed
            ws.send_json({"op": "unsubscribe", "args": [
                {"channel": "candle", "symbol": "XRPUSDT", "timeframe": "1h"}]})
            assert ws.receive_json()["event"] == "unsubscribed"
            assert ("USDT-FUTURES", "XRPUSDT", "1h") in stream.unsubscribed


def test_ws_candle_snapshot_prioritizes_live_stream_when_parquet_empty() -> None:
    """Empty parquet + live bar must still produce a last_candle frame."""
    with _tmp() as tmp:
        settings = Settings(data_dir=Path(tmp))  # no parquet seeded
        bar = {"open_time": 1700000000000, "open": 1.0, "high": 2.0,
               "low": 0.0, "close": 1.5, "volume": 1.0}
        c = TestClient(create_app(settings, stream=_FakeStream(bar=bar), market=_FakeMarket()))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [
                {"channel": "candle", "symbol": "BTCUSDT", "timeframe": "5m"}]})
            msg = ws.receive_json()
            assert msg["channel"] == "candle" and msg["action"] == "snapshot"
            assert "error" not in msg["data"]
            assert msg["data"]["last_candle"]["close"] == 1.5
            assert "price" in msg["data"]
            assert ws.receive_json()["event"] == "subscribed"


def test_ws_candle_snapshot_error_when_no_stream_and_no_parquet() -> None:
    """No live bar and no parquet returns an explicit no-data error frame."""
    with _tmp() as tmp:
        settings = Settings(data_dir=Path(tmp))  # no parquet seeded
        c = TestClient(create_app(settings, stream=_FakeStream(None), market=_FakeMarket()))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [
                {"channel": "candle", "symbol": "BTCUSDT", "timeframe": "5m"}]})
            msg = ws.receive_json()
            assert msg["channel"] == "candle" and msg["action"] == "snapshot"
            assert msg["data"] == {"error": "no data"}
            assert ws.receive_json()["event"] == "subscribed"


def test_ws_candle_event_driven_update_frame() -> None:
    """After subscribing, live bar updates push event-driven update frames
    carrying last_candle + price but no indicator/S-R fields."""
    with _tmp() as tmp:
        settings = _seed(tmp)
        stream = _FakeStream(None)
        c = TestClient(create_app(settings, stream=stream, market=_FakeMarket()))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [
                {"channel": "candle", "symbol": "BTCUSDT", "timeframe": "5m"}]})
            assert ws.receive_json()["action"] == "snapshot"
            assert ws.receive_json()["event"] == "subscribed"
            assert ("USDT-FUTURES", "BTCUSDT", "5m") in stream.added
            # fire a live bar update through the registered listener
            stream.emit("USDT-FUTURES", "BTCUSDT", "5m",
                        {"open_time": 1700000000000, "open": 1, "high": 2, "low": 0,
                         "close": 1.5, "volume": 1})
            msg = ws.receive_json()
            assert msg["channel"] == "candle" and msg["action"] == "update"
            assert msg["data"]["last_candle"]["close"] == 1.5
            assert msg["data"]["price"] == 1.5
            assert "levels" not in msg["data"]
            assert "macd_hist" not in msg["data"]


def test_ws_candle_unsubscribe_removes_listener() -> None:
    """Unsubscribing releases the stream listener for that series."""
    with _tmp() as tmp:
        settings = _seed(tmp)
        stream = _FakeStream(None)
        c = TestClient(create_app(settings, stream=stream, market=_FakeMarket()))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [
                {"channel": "candle", "symbol": "BTCUSDT", "timeframe": "5m"}]})
            assert ws.receive_json()["action"] == "snapshot"
            assert ws.receive_json()["event"] == "subscribed"
            ws.send_json({"op": "unsubscribe", "args": [
                {"channel": "candle", "symbol": "BTCUSDT", "timeframe": "5m"}]})
            assert ws.receive_json()["event"] == "unsubscribed"
            assert ("USDT-FUTURES", "BTCUSDT", "5m") in stream.removed
            assert ("USDT-FUTURES", "BTCUSDT", "5m") in stream.unsubscribed


def test_ws_candle_disconnect_removes_listener() -> None:
    """Closing the connection releases the candle listener for that series."""
    with _tmp() as tmp:
        settings = _seed(tmp)
        stream = _FakeStream(None)
        c = TestClient(create_app(settings, stream=stream, market=_FakeMarket()))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [
                {"channel": "candle", "symbol": "BTCUSDT", "timeframe": "5m"}]})
            assert ws.receive_json()["action"] == "snapshot"
            assert ws.receive_json()["event"] == "subscribed"
        assert ("USDT-FUTURES", "BTCUSDT", "5m") in stream.removed
        assert ("USDT-FUTURES", "BTCUSDT", "5m") in stream.unsubscribed


def test_ws_candle_multi_period_routing() -> None:
    """Same symbol subscribed at multiple timeframes coexists independently;
    frames carry the full series identity (category/symbol/timeframe)."""
    with _tmp() as tmp:
        settings = _seed(tmp)
        stream = _FakeStream(None)
        c = TestClient(create_app(settings, stream=stream, market=_FakeMarket()))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [
                {"channel": "candle", "symbol": "BTCUSDT", "timeframe": "5m"},
                {"channel": "candle", "symbol": "BTCUSDT", "timeframe": "1h"},
            ]})
            # two snapshots then two acks (order follows the args list)
            snap1 = ws.receive_json()
            assert snap1["channel"] == "candle" and snap1["action"] == "snapshot"
            assert snap1["timeframe"] == "5m"
            assert snap1["symbol"] == "BTCUSDT"
            assert snap1["category"] == "USDT-FUTURES"
            ack1 = ws.receive_json()
            assert ack1["event"] == "subscribed" and ack1["timeframe"] == "5m"
            snap2 = ws.receive_json()
            assert snap2["channel"] == "candle" and snap2["action"] == "snapshot"
            assert snap2["timeframe"] == "1h"
            ack2 = ws.receive_json()
            assert ack2["event"] == "subscribed" and ack2["timeframe"] == "1h"
            # both series registered as independent stream subscriptions
            assert ("USDT-FUTURES", "BTCUSDT", "5m") in stream.subscribed
            assert ("USDT-FUTURES", "BTCUSDT", "1h") in stream.subscribed
            # event-driven update frames carry the full identity
            stream.emit("USDT-FUTURES", "BTCUSDT", "5m",
                        {"open_time": 1700000000000, "open": 1, "high": 2, "low": 0,
                         "close": 1.5, "volume": 1})
            upd = ws.receive_json()
            assert upd["channel"] == "candle" and upd["action"] == "update"
            assert upd["timeframe"] == "5m"
            assert upd["symbol"] == "BTCUSDT"
            assert upd["category"] == "USDT-FUTURES"
            # unsubscribe only 1h: 5m listener must survive
            ws.send_json({"op": "unsubscribe", "args": [
                {"channel": "candle", "symbol": "BTCUSDT", "timeframe": "1h"}]})
            assert ws.receive_json()["event"] == "unsubscribed"
            assert ("USDT-FUTURES", "BTCUSDT", "1h") in stream.unsubscribed
            assert ("USDT-FUTURES", "BTCUSDT", "1h") in stream.removed
            assert ("USDT-FUTURES", "BTCUSDT", "5m") not in stream.removed


def test_ws_candle_multi_period_update_frames_do_not_cross() -> None:
    """A live bar for one timeframe must not be routed to another timeframe's
    subscriber (no cross-period contamination)."""
    with _tmp() as tmp:
        settings = _seed(tmp)
        stream = _FakeStream(None)
        c = TestClient(create_app(settings, stream=stream, market=_FakeMarket()))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [
                {"channel": "candle", "symbol": "BTCUSDT", "timeframe": "5m"},
                {"channel": "candle", "symbol": "BTCUSDT", "timeframe": "1h"},
            ]})
            for _ in range(4):
                ws.receive_json()
            # 5m bar arrives: the 1h series must not see it
            stream.emit("USDT-FUTURES", "BTCUSDT", "5m",
                        {"open_time": 1700000000000, "open": 1, "high": 2, "low": 0,
                         "close": 1.5, "volume": 1})
            upd = ws.receive_json()
            assert upd["timeframe"] == "5m"
            assert upd["data"]["last_candle"]["open_time"] == 1700000000000


def test_ws_candle_update_throttled_to_one_per_second() -> None:
    """Bursts of live bars coalesce: update frames are sent at most ~1/s and
    always carry the newest price."""
    import time as _time

    with _tmp() as tmp:
        settings = _seed(tmp)
        stream = _FakeStream(None)
        c = TestClient(create_app(settings, stream=stream, market=_FakeMarket()))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [
                {"channel": "candle", "symbol": "BTCUSDT", "timeframe": "5m"}]})
            assert ws.receive_json()["action"] == "snapshot"
            assert ws.receive_json()["event"] == "subscribed"
            t0 = _time.monotonic()
            # first bar: sent immediately
            stream.emit("USDT-FUTURES", "BTCUSDT", "5m",
                        {"open_time": 1700000000000, "open": 1, "high": 2, "low": 0,
                         "close": 1.5, "volume": 1})
            m1 = ws.receive_json()
            assert m1["data"]["last_candle"]["close"] == 1.5
            # burst: two more bars within the throttle window coalesce into one
            stream.emit("USDT-FUTURES", "BTCUSDT", "5m",
                        {"open_time": 1700000000000, "open": 1, "high": 3, "low": 0,
                         "close": 2.5, "volume": 1})
            stream.emit("USDT-FUTURES", "BTCUSDT", "5m",
                        {"open_time": 1700000000000, "open": 1, "high": 4, "low": 0,
                         "close": 3.5, "volume": 1})
            m2 = ws.receive_json()  # blocks until the ~1s coalesced flush fires
            assert m2["data"]["last_candle"]["close"] == 3.5
            assert _time.monotonic() - t0 >= 1.0
            # after the flush the throttle resets: the next bar sends at once
            stream.emit("USDT-FUTURES", "BTCUSDT", "5m",
                        {"open_time": 1700000000000, "open": 1, "high": 5, "low": 0,
                         "close": 4.5, "volume": 1})
            m3 = ws.receive_json()
            assert m3["data"]["last_candle"]["close"] == 4.5


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
            assert ("books", "BTCUSDT", "USDT-FUTURES") in market.subscribed
            ws.send_json({"op": "unsubscribe", "args": [{"channel": "books", "symbol": "BTCUSDT"}]})
            assert ws.receive_json()["event"] == "unsubscribed"
            assert ("books", "BTCUSDT", "USDT-FUTURES") in market.unsubscribed


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


def test_ws_ticker_wildcard_receives_periodic_update() -> None:
    """A wildcard ticker subscription gets the initial snapshot AND subsequent
    market-hub update frames (symbol=*), so watchlist prices stay live."""
    with _tmp() as tmp:
        settings = _seed(tmp)
        market = _FakeMarket()
        c = TestClient(create_app(settings, stream=_FakeStream(None), market=market))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [
                {"channel": "ticker", "symbol": "default"}]})
            snap = ws.receive_json()
            assert snap["channel"] == "ticker" and snap["action"] == "snapshot"
            assert snap["symbol"] == "default"
            ack = ws.receive_json()
            assert ack["event"] == "subscribed"
            # market hub emits a full-market ticker update -> forwarded to ws
            market.emit("USDT-FUTURES", "ticker", "*", "update",
                        [{"instId": "BTCUSDT", "lastPr": "64000"}])
            upd = ws.receive_json()
            assert upd["channel"] == "ticker" and upd["action"] == "update"
            assert upd["symbol"] == "*"
            assert upd["category"] == "USDT-FUTURES"
            assert upd["data"][0]["instId"] == "BTCUSDT"


def test_ws_ticker_category_wildcard_receives_any_category() -> None:
    """A ticker subscription with category=\"*\" receives updates for any
    product line (SPOT, USDT-FUTURES, ...) so the all-market watchlist stays
    live across categories."""
    with _tmp() as tmp:
        settings = _seed(tmp)
        market = _FakeMarket()
        c = TestClient(create_app(settings, stream=_FakeStream(None), market=market))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [
                {"channel": "ticker", "symbol": "default", "category": "*"}]})
            snap = ws.receive_json()
            assert snap["channel"] == "ticker" and snap["action"] == "snapshot"
            assert snap["symbol"] == "default"
            assert ws.receive_json()["event"] == "subscribed"
            # SPOT category update arrives despite subscribing with category="*"
            market.emit("SPOT", "ticker", "*", "update",
                        [{"instId": "XAUUSDT", "lastPr": "2400.0"}])
            upd = ws.receive_json()
            assert upd["channel"] == "ticker" and upd["action"] == "update"
            assert upd["category"] == "SPOT"
            assert upd["data"][0]["instId"] == "XAUUSDT"


def test_ws_disconnect_releases_subscriptions() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        market = _FakeMarket()
        c = TestClient(create_app(settings, stream=_FakeStream(None), market=market))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [{"channel": "books", "symbol": "BTCUSDT"}]})
            ws.receive_json()
            ws.receive_json()
        assert ("books", "BTCUSDT", "USDT-FUTURES") in market.unsubscribed
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


def test_rest_category_filter_and_paths() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        market = _FakeMarket()
        c = TestClient(create_app(settings, stream=_FakeStream(None), market=market))
        # query param filtering (harmless against the fake, exercises the route)
        assert c.get("/tickers", params={"category": "SPOT"}).status_code == 200
        assert c.get("/instruments", params={"category": "SPOT"}).status_code == 200
        # categorized paths
        book = c.get("/books/SPOT/BTCUSDT").json()
        assert book["category"] == "SPOT" and book["asks"] == [[101.0, 5.0]]
        trades = c.get("/trades/SPOT/BTCUSDT").json()["trades"]
        assert trades[0]["side"] == "buy"
        # default category stays USDT-FUTURES on single-segment paths
        assert c.get("/books/BTCUSDT").json()["category"] == "USDT-FUTURES"


def test_ws_subscribe_with_category() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        market = _FakeMarket()
        c = TestClient(create_app(settings, stream=_FakeStream(None), market=market))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [
                {"channel": "books", "symbol": "BTCUSDT", "category": "SPOT"}]})
            snap = ws.receive_json()
            assert snap["channel"] == "books" and snap["action"] == "snapshot"
            assert snap.get("category") == "SPOT"
            assert ws.receive_json()["event"] == "subscribed"
            assert ("books", "BTCUSDT", "SPOT") in market.subscribed


def test_ws_subscribe_default_category() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        market = _FakeMarket()
        c = TestClient(create_app(settings, stream=_FakeStream(None), market=market))
        with c.websocket_connect("/ws") as ws:
            ws.send_json({"op": "subscribe", "args": [{"channel": "books", "symbol": "BTCUSDT"}]})
            ws.receive_json()
            ws.receive_json()
            assert ("books", "BTCUSDT", "USDT-FUTURES") in market.subscribed


def test_books_empty_when_not_subscribed() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)

        class _Empty(_FakeMarket):
            def orderbook(self, symbol: str, category: str = "USDT-FUTURES") -> dict | None:  # noqa: ARG001
                return None

            def trades(self, symbol: str, limit: int | None = None, category: str = "USDT-FUTURES") -> list:  # noqa: ARG001
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
        # REST seed is best-effort: with an offline upstream it stays empty.
        import market_data.webapi as webapi

        def offline_get(*_a, **_k):
            raise RuntimeError("offline")

        orig_get = webapi.httpx.get
        webapi.httpx.get = offline_get
        try:
            r = c.get("/candles/recent", params={"symbol": "ETHUSDT", "timeframe": "5m"}).json()
        finally:
            webapi.httpx.get = orig_get
        assert r["count"] == 0 and r["candles"] == []


def test_candles_recent_seeds_from_rest_when_stream_empty() -> None:
    """A freshly switched symbol/timeframe seeds history from Bitget REST."""
    with _tmp() as tmp:
        settings = _seed(tmp)
        app = create_app(settings, stream=_FakeStream(None))
        c = TestClient(app)
        import market_data.webapi as webapi

        rows = [
            ["1700000000000", "100", "101", "99", "100.5", "7.5", "1"],
            ["1700003600000", "100.5", "102", "100", "101", "8", "1"],
        ]

        class _FakeResp:
            def raise_for_status(self):
                return None

            def json(self):
                return {"code": "00000", "data": rows}

        def fake_get(_url, params=None, timeout=None):  # noqa: ANN001, ARG001
            return _FakeResp()

        orig_get = webapi.httpx.get
        webapi.httpx.get = fake_get
        try:
            r = c.get("/candles/recent", params={"symbol": "XRPUSDT", "timeframe": "4h"}).json()
        finally:
            webapi.httpx.get = orig_get
        assert r["count"] == 2
        assert r["candles"][-1]["close"] == 101.0
        assert r["candles"][-1]["open_time"] == 1700003600000


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


class _FakeMcpClient:
    """Context-manager stand-in for McpDataClient: serves canned candle pages."""

    def __init__(self, pages: list, fail_rate_limits: int = 0, rate_msg: str = "rate limit exceeded") -> None:
        self.pages = list(pages)
        self.fail_rate_limits = fail_rate_limits
        self.rate_msg = rate_msg
        self.calls: list[dict] = []

    def __enter__(self) -> "_FakeMcpClient":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def call_tool(self, name: str, arguments: dict):  # noqa: ANN001
        from market_data.mcp_client import McpError

        self.calls.append(dict(arguments))
        if self.fail_rate_limits > 0:
            self.fail_rate_limits -= 1
            raise McpError(self.rate_msg)
        if self.pages:
            return {"data": self.pages.pop(0)}
        return {"data": []}


def test_backfill_appends_older_history_and_candles_continue() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        settings.candle_page_limit = 3
        older = [[BASE - (i + 1) * STEP, 1.0, 2.0, 0.5, 1.5, 1.0] for i in range(5)]
        fake = _FakeMcpClient([older])
        c = TestClient(create_app(settings, backfill_client_factory=lambda: fake))
        r = c.post("/candles/backfill", json={
            "category": "USDT-FUTURES", "symbol": "BTCUSDT", "timeframe": "5m",
            "before": BASE, "max_pages": 3,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["appended"] == 5
        assert body["earliest_reached"] is True  # page shorter than page limit

        rows = c.get("/candles", params={
            "symbol": "BTCUSDT", "timeframe": "5m",
            "start": BASE - 6 * STEP, "end": BASE + 2 * STEP, "limit": 500,
        }).json()["candles"]
        assert rows[0]["open_time"] == BASE - 5 * STEP
        assert any(row["open_time"] == BASE for row in rows)  # contiguous with seeded range


def test_backfill_terminates_when_exchange_has_nothing_older() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        fake = _FakeMcpClient([])
        c = TestClient(create_app(settings, backfill_client_factory=lambda: fake))
        body = c.post("/candles/backfill", json={
            "category": "USDT-FUTURES", "symbol": "BTCUSDT", "timeframe": "5m",
            "before": BASE,
        }).json()
        assert body["appended"] == 0
        assert body["earliest_reached"] is True


def test_backfill_rate_limit_retry_keeps_progress() -> None:
    import market_data.ingestion as ingestion_mod

    with _tmp() as tmp:
        settings = _seed(tmp)
        settings.candle_page_limit = 2
        page1 = [[BASE - 2 * STEP, 1, 2, 0, 1, 1], [BASE - 3 * STEP, 1, 2, 0, 1, 1]]
        page2 = [[BASE - 5 * STEP, 1, 2, 0, 1, 1]]
        fake = _FakeMcpClient([page1, page2], fail_rate_limits=1)
        c = TestClient(create_app(settings, backfill_client_factory=lambda: fake))

        original_sleep = ingestion_mod.time.sleep
        sleeps: list[float] = []
        ingestion_mod.time.sleep = lambda s: sleeps.append(s)
        try:
            r = c.post("/candles/backfill", json={
                "category": "USDT-FUTURES", "symbol": "BTCUSDT", "timeframe": "5m",
                "before": BASE, "max_pages": 5,
            })
        finally:
            ingestion_mod.time.sleep = original_sleep

        assert r.status_code == 200
        body = r.json()
        assert body["appended"] == 3
        assert body["earliest_reached"] is True
        assert len(sleeps) == 1  # one backoff pause
        assert len(fake.calls) == 3  # failed attempt + 2 successful pages

        rows = c.get("/candles", params={
            "symbol": "BTCUSDT", "timeframe": "5m",
            "start": BASE - 6 * STEP, "end": BASE, "limit": 500,
        }).json()["candles"]
        assert [row["open_time"] for row in rows] == [BASE - 5 * STEP, BASE - 3 * STEP, BASE - 2 * STEP, BASE]


def test_backfill_rejects_invalid_max_pages() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        fake = _FakeMcpClient([])
        c = TestClient(create_app(settings, backfill_client_factory=lambda: fake))
        for bad in (0, 21):
            r = c.post("/candles/backfill", json={
                "category": "USDT-FUTURES", "symbol": "BTCUSDT", "timeframe": "5m",
                "before": BASE, "max_pages": bad,
            })
            assert r.status_code == 422
        assert fake.calls == []  # never hit the upstream


def test_alerts_crud_and_persistence() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        c = TestClient(create_app(settings, stream=_FakeStream(None), market=_FakeMarket()))

        # empty at first
        assert c.get("/alerts").json() == {"alerts": []}

        # create
        r = c.post("/alerts", json={"symbol": "BTCUSDT", "condition": "above", "threshold": 70000})
        assert r.status_code == 200
        created = r.json()["alert"]
        assert created["symbol"] == "BTCUSDT"
        alert_id = created["id"]

        # list reflects the create
        listed = c.get("/alerts").json()["alerts"]
        assert len(listed) == 1 and listed[0]["threshold"] == 70000

        # update threshold + triggered
        r = c.put(f"/alerts/{alert_id}", json={"threshold": 72000, "triggered": True})
        assert r.status_code == 200
        assert r.json()["alert"]["threshold"] == 72000
        assert r.json()["alert"]["triggered"] is True

        # rejects invalid condition
        assert c.post("/alerts", json={"symbol": "BTC", "condition": "sideways", "threshold": 1}).status_code == 400

        # delete
        assert c.delete(f"/alerts/{alert_id}").json() == {"ok": True}
        assert c.get("/alerts").json() == {"alerts": []}
        assert c.delete(f"/alerts/{alert_id}").status_code == 404


def test_alerts_persist_across_app_restart() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        c1 = TestClient(create_app(settings, stream=_FakeStream(None), market=_FakeMarket()))
        c1.post("/alerts", json={"symbol": "ETHUSDT", "condition": "below", "threshold": 2500})
        # a brand-new app instance over the same data_dir
        c2 = TestClient(create_app(settings, stream=_FakeStream(None), market=_FakeMarket()))
        alerts = c2.get("/alerts").json()["alerts"]
        assert len(alerts) == 1 and alerts[0]["symbol"] == "ETHUSDT"


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All webapi tests passed.")


if __name__ == "__main__":
    _run_all()
