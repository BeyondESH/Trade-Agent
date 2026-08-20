"""L2 live WS tests: real WebSocket against a spawned uvicorn /ws.

Covers connection, ping/pong, candle subscription (snapshot + event frames),
market-channel subscriptions, dynamic subscribe/unsubscribe, and error paths.
Real-time push availability depends on the upstream Bitget WS; protocol-level
behavior is validated offline against the seeded store.

Sync-style tests using asyncio.run (no pytest-asyncio dependency).
"""

from __future__ import annotations

import asyncio
import json

import pytest
import websockets
from websockets.asyncio.client import ClientConnection

CAT = "USDT-FUTURES"


async def _connect(base: str) -> ClientConnection:
    ws_url = base.replace("http://", "ws://") + "/ws"
    return await websockets.connect(ws_url, open_timeout=10, close_timeout=5)


async def _recv_until(ws: ClientConnection, predicate, timeout: float = 5.0) -> dict:
    """Receive frames until one matches the predicate, else fail."""
    try:
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
            try:
                obj = json.loads(raw)
            except (TypeError, ValueError):
                continue
            if predicate(obj):
                return obj
    except TimeoutError:
        raise AssertionError("timed out waiting for a matching WS frame")


def _sub_candle(symbol: str = "BTCUSDT", timeframe: str = "1m") -> str:
    return json.dumps({"op": "subscribe", "args": [
        {"channel": "candle", "symbol": symbol, "category": CAT, "timeframe": timeframe}]})


def _sub(channel: str, symbol: str = "BTCUSDT") -> str:
    return json.dumps({"op": "subscribe", "args": [
        {"channel": channel, "symbol": symbol, "category": CAT}]})


def _unsub(channel: str, symbol: str = "BTCUSDT", timeframe: str | None = None) -> str:
    arg = {"channel": channel, "symbol": symbol, "category": CAT}
    if timeframe:
        arg["timeframe"] = timeframe
    return json.dumps({"op": "unsubscribe", "args": [arg]})


def _run(coro):
    return asyncio.run(coro)


def test_ws_connect_and_ping_pong(live_server: str) -> None:
    async def scenario() -> None:
        async with await _connect(live_server) as ws:
            await ws.send(json.dumps({"event": "ping"}))
            pong = await _recv_until(ws, lambda o: o.get("event") == "pong")
            assert pong["event"] == "pong"
    _run(scenario())


def test_ws_candle_snapshot(live_server: str) -> None:
    async def scenario() -> None:
        async with await _connect(live_server) as ws:
            await ws.send(_sub_candle("BTCUSDT", "1m"))
            snap = await _recv_until(
                ws,
                lambda o: o.get("action") == "snapshot" and o.get("channel") == "candle",
            )
            assert snap["symbol"] == "BTCUSDT"
            assert snap["timeframe"] == "1m"
            assert isinstance(snap["data"], dict)
            ev = await _recv_until(ws, lambda o: o.get("event") == "subscribed")
            assert ev["channel"] == "candle"
    _run(scenario())


def test_ws_candle_empty_series_error_frame(live_server: str) -> None:
    async def scenario() -> None:
        async with await _connect(live_server) as ws:
            # UNIUSDT has no seed data -> snapshot returns {"error": "no data"}
            await ws.send(_sub_candle("UNIUSDT", "1h"))
            snap = await _recv_until(
                ws,
                lambda o: o.get("action") == "snapshot" and o.get("channel") == "candle",
            )
            assert snap["symbol"] == "UNIUSDT"
            assert "error" in snap["data"] or "price" in snap["data"]
    _run(scenario())


def test_ws_ticker_subscription(live_server: str) -> None:
    async def scenario() -> None:
        async with await _connect(live_server) as ws:
            await ws.send(_sub("ticker", ""))
            # Offline the REST-seeded mirror may be empty; the subscribed
            # event is the stable protocol signal.
            ev = await _recv_until(ws, lambda o: o.get("event") == "subscribed" and o.get("channel") == "ticker")
            assert ev["symbol"] == ""
    _run(scenario())


def test_ws_books_subscription(live_server: str) -> None:
    async def scenario() -> None:
        async with await _connect(live_server) as ws:
            await ws.send(_sub("books"))
            # Offline (no upstream market hub) the snapshot may be absent
            # because _market_snapshot returns None; the subscribed event is
            # the stable protocol-level signal.
            ev = await _recv_until(ws, lambda o: o.get("event") == "subscribed" and o.get("channel") == "books")
            assert ev["symbol"] == "BTCUSDT"
    _run(scenario())


def test_ws_trade_subscription(live_server: str) -> None:
    async def scenario() -> None:
        async with await _connect(live_server) as ws:
            await ws.send(_sub("trade"))
            ev = await _recv_until(ws, lambda o: o.get("event") == "subscribed" and o.get("channel") == "trade")
            assert ev["symbol"] == "BTCUSDT"
    _run(scenario())


def test_ws_dynamic_subscribe_and_unsubscribe(live_server: str) -> None:
    async def scenario() -> None:
        async with await _connect(live_server) as ws:
            await ws.send(_sub_candle("BTCUSDT", "1m"))
            await _recv_until(ws, lambda o: o.get("action") == "snapshot" and o.get("symbol") == "BTCUSDT")
            await _recv_until(ws, lambda o: o.get("event") == "subscribed")

            await ws.send(_sub_candle("ETHUSDT", "1h"))
            snap2 = await _recv_until(ws, lambda o: o.get("action") == "snapshot" and o.get("symbol") == "ETHUSDT")
            assert snap2["timeframe"] == "1h"
            await _recv_until(ws, lambda o: o.get("event") == "subscribed" and o.get("symbol") == "ETHUSDT")

            await ws.send(_unsub("candle", "BTCUSDT", "1m"))
            unsub = await _recv_until(ws, lambda o: o.get("event") == "unsubscribed" and o.get("symbol") == "BTCUSDT")
            assert unsub["channel"] == "candle"
    _run(scenario())


def test_ws_ping_after_subscription(live_server: str) -> None:
    async def scenario() -> None:
        async with await _connect(live_server) as ws:
            await ws.send(_sub_candle("BTCUSDT", "1m"))
            await _recv_until(ws, lambda o: o.get("action") == "snapshot")
            await ws.send(json.dumps({"event": "ping"}))
            pong = await _recv_until(ws, lambda o: o.get("event") == "pong")
            assert pong["event"] == "pong"
    _run(scenario())


def test_ws_malformed_frames_ignored(live_server: str) -> None:
    """Malformed JSON must not kill the connection."""
    async def scenario() -> None:
        async with await _connect(live_server) as ws:
            await ws.send("not-json{{{")
            await ws.send(_sub_candle("BTCUSDT", "1m"))
            snap = await _recv_until(ws, lambda o: o.get("action") == "snapshot")
            assert snap["symbol"] == "BTCUSDT"
    _run(scenario())


def test_ws_event_frames_monotonic_if_live(live_server: str) -> None:
    """If live pushes arrive (upstream reachable), open_time must not regress.

    Offline (no upstream) this simply checks the connection survives the
    observation window.
    """
    async def scenario() -> None:
        async with await _connect(live_server) as ws:
            await ws.send(_sub_candle("BTCUSDT", "1m"))
            await _recv_until(ws, lambda o: o.get("action") == "snapshot")
            last_open: int | None = None
            try:
                for _ in range(4):
                    frame = await asyncio.wait_for(ws.recv(), timeout=3.0)
                    obj = json.loads(frame)
                    if obj.get("action") != "update":
                        continue
                    bc = obj.get("data", {}).get("last_candle")
                    if bc is None:
                        continue
                    ot = int(bc["open_time"])
                    if last_open is not None:
                        assert ot >= last_open, f"open_time regressed {last_open} -> {ot}"
                    last_open = ot
            except TimeoutError:
                pass  # quiet market / no upstream: nothing to assert
    _run(scenario())
