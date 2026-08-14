"""Offline tests for the Bitget WS realtime stream.

Run:
    python tests/test_realtime.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import asyncio
import json

import websockets
from websockets.asyncio.server import ServerConnection

from market_data.realtime import BitgetWsStream, PONG_FRAME

CAT = "USDT-FUTURES"
SYM = "BTCUSDT"


def _stream(**kw) -> BitgetWsStream:  # noqa: ANN003
    defaults = dict(
        url="ws://127.0.0.1:1",
        category=CAT,
        symbols=[SYM],
        timeframes=["5m"],
        heartbeat_seconds=30.0,
        reconnect_seconds=0.05,
    )
    defaults.update(kw)
    return BitgetWsStream(**defaults)


def _update_frame(close: str, ts: str = "1700000000000", action: str = "update") -> str:
    return json.dumps(
        {
            "action": action,
            "arg": {"instType": CAT, "channel": "candle5m", "instId": SYM},
            "data": [[ts, "100", "101", "99", close, "7.5", "1", "1"]],
        }
    )


class _FakeWs:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send(self, text: str) -> None:
        self.sent.append(text)


# -- 4.1 frame parsing / buffer -------------------------------------------
def test_channels_cover_symbols_and_timeframes() -> None:
    s = _stream(symbols=[SYM, "ETHUSDT"], timeframes=["5m", "1d"])
    channels = s._channels()
    assert len(channels) == 4
    assert {"instType": CAT, "channel": "candle5m", "instId": SYM} in channels
    assert {"instType": CAT, "channel": "candle1D", "instId": "ETHUSDT"} in channels


def test_channels_use_bitget_interval_tokens() -> None:
    s = _stream(timeframes=["1m", "1h", "4h", "12h", "1d"])
    channels = {ch["channel"] for ch in s._channels()}
    assert channels == {"candle1m", "candle1H", "candle4H", "candle12H", "candle1D"}


def test_latest_empty_before_frames() -> None:
    s = _stream()
    assert s.latest(CAT, SYM, "5m") is None


def test_update_frame_fills_buffer() -> None:
    s = _stream()
    asyncio.run(s._handle_frame(_FakeWs(), _update_frame("123.4")))
    bar = s.latest(CAT, SYM, "5m")
    assert bar is not None
    assert bar["open_time"] == 1_700_000_000_000
    assert bar["close"] == 123.4 and bar["volume"] == 7.5
    # latest returns a copy, not the internal dict
    assert s.latest(CAT, SYM, "5m") == bar
    assert s.latest(CAT, SYM, "5m") is not s._buffer[s._series_key(CAT, SYM, "5m")][-1]


def test_same_open_time_overwrites() -> None:
    s = _stream()
    asyncio.run(s._handle_frame(_FakeWs(), _update_frame("10")))
    asyncio.run(s._handle_frame(_FakeWs(), _update_frame("20")))
    recent = s.recent(CAT, SYM, "5m")
    assert len(recent) == 1 and recent[0]["close"] == 20


def test_snapshot_action_caches_batch() -> None:
    s = _stream()
    frame = json.dumps(
        {
            "action": "snapshot",
            "arg": {"instType": CAT, "channel": "candle5m", "instId": SYM},
            "data": [
                ["1700000000000", "100", "101", "99", "10", "1"],
                ["1700000300000", "101", "102", "100", "11", "2"],
                ["1700000600000", "102", "103", "101", "12", "3"],
            ],
        }
    )
    asyncio.run(s._handle_frame(_FakeWs(), frame))
    recent = s.recent(CAT, SYM, "5m")
    assert [b["open_time"] for b in recent] == [1_700_000_000_000, 1_700_000_300_000, 1_700_000_600_000]
    assert recent[-1]["close"] == 12
    assert s.latest(CAT, SYM, "5m")["close"] == 12


def test_recent_respects_limit() -> None:
    s = _stream()
    rows = [[str(1_700_000_000_000 + i * 300_000), "100", "101", "99", str(10 + i), "1"]
            for i in range(10)]
    frame = json.dumps({"action": "snapshot",
                        "arg": {"instType": CAT, "channel": "candle5m", "instId": SYM},
                        "data": rows})
    asyncio.run(s._handle_frame(_FakeWs(), frame))
    recent = s.recent(CAT, SYM, "5m", limit=3)
    assert len(recent) == 3
    assert [b["close"] for b in recent] == [17.0, 18.0, 19.0]


def test_upsert_out_of_order_inserts_sorted() -> None:
    s = _stream()
    asyncio.run(s._handle_frame(_FakeWs(), _update_frame("20", ts="1700000600000")))
    asyncio.run(s._handle_frame(_FakeWs(), _update_frame("10", ts="1700000000000")))
    recent = s.recent(CAT, SYM, "5m")
    assert [b["open_time"] for b in recent] == [1_700_000_000_000, 1_700_000_600_000]
    assert recent[0]["close"] == 10 and recent[1]["close"] == 20


def test_buffer_trims_to_capacity() -> None:
    from market_data.realtime import MAX_BARS_PER_SERIES

    s = _stream()
    rows = [[str(1_700_000_000_000 + i * 300_000), "100", "101", "99", "1", "1"]
            for i in range(MAX_BARS_PER_SERIES + 50)]
    frame = json.dumps({"action": "snapshot",
                        "arg": {"instType": CAT, "channel": "candle5m", "instId": SYM},
                        "data": rows})
    asyncio.run(s._handle_frame(_FakeWs(), frame))
    recent = s.recent(CAT, SYM, "5m")
    assert len(recent) == MAX_BARS_PER_SERIES
    assert recent[0]["open_time"] == 1_700_000_000_000 + 50 * 300_000
    assert recent[-1]["open_time"] == 1_700_000_000_000 + (MAX_BARS_PER_SERIES + 49) * 300_000


def test_multi_series_isolated() -> None:
    s = _stream(symbols=[SYM, "ETHUSDT"])
    eth = json.dumps(
        {"action": "update", "arg": {"instType": CAT, "channel": "candle5m", "instId": "ETHUSDT"},
         "data": [["1700000000000", "10", "11", "9", "10.5", "1"]]}
    )
    asyncio.run(s._handle_frame(_FakeWs(), _update_frame("99")))
    asyncio.run(s._handle_frame(_FakeWs(), eth))
    assert s.latest(CAT, SYM, "5m")["close"] == 99
    assert s.latest(CAT, "ETHUSDT", "5m")["close"] == 10.5
    assert s.latest(CAT, SYM, "1d") is None


def test_ping_replies_pong() -> None:
    s = _stream()
    ws = _FakeWs()
    asyncio.run(s._handle_frame(ws, '{"event":"ping"}'))
    assert ws.sent == [PONG_FRAME]


def test_garbage_frames_ignored() -> None:
    s = _stream()
    asyncio.run(s._handle_frame(_FakeWs(), "not json"))
    asyncio.run(s._handle_frame(_FakeWs(), json.dumps({"action": "subscribe"})))
    asyncio.run(s._handle_frame(_FakeWs(), json.dumps({"event": "subscribe", "arg": {}})))
    assert s.latest(CAT, SYM, "5m") is None


# -- 4.2 reconnect + resubscribe -------------------------------------------
def test_reconnect_resubscribes_and_resumes() -> None:
    async def scenario() -> None:
        connections = 0

        async def handler(ws: ServerConnection) -> None:
            nonlocal connections
            connections += 1
            # wait for the client's subscribe before pushing data
            try:
                await asyncio.wait_for(ws.recv(), timeout=5)
            except Exception:  # noqa: BLE001
                pass
            await ws.send(json.dumps({"event": "subscribe", "arg": {}}))
            if connections == 1:
                await ws.send(_update_frame("10"))
                await ws.close()  # force reconnect
            else:
                await ws.send(_update_frame("20"))
                await asyncio.sleep(30)

        server = await websockets.serve(handler, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        try:
            s = _stream(url=f"ws://127.0.0.1:{port}", reconnect_seconds=0.2)
            s.start()
            try:
                for _ in range(200):
                    bar = s.latest(CAT, SYM, "5m")
                    if bar and bar["close"] == 10:
                        break
                    await asyncio.sleep(0.02)
                assert bar is not None and bar["close"] == 10
                for _ in range(200):
                    bar = s.latest(CAT, SYM, "5m")
                    if bar and bar["close"] == 20:
                        break
                    await asyncio.sleep(0.02)
                assert bar is not None and bar["close"] == 20
                assert connections >= 2
            finally:
                await s.stop()
        finally:
            server.close()

    asyncio.run(scenario())


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All realtime tests passed.")


if __name__ == "__main__":
    _run_all()
