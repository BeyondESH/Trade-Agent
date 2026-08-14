"""Offline tests for the multi-channel market stream hub.

Run:
    python tests/test_streamhub.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import asyncio
import json

from market_data.streamhub import MarketStream, OrderBookMerger, PONG_FRAME, RefCountSubscription

CAT = "USDT-FUTURES"


def _stream(**kw) -> MarketStream:  # noqa: ANN003
    defaults = dict(
        url="ws://127.0.0.1:1",
        category=CAT,
        heartbeat_seconds=30.0,
        reconnect_seconds=0.05,
        fetch_instruments=lambda _cat: [],
    )
    defaults.update(kw)
    return MarketStream(**defaults)


# -- RefCountSubscription --------------------------------------------------
def test_refcount_acquire_release() -> None:
    acquired: list[list] = []
    released: list[list] = []
    refs = RefCountSubscription(acquired.append, released.append)
    refs.subscribe("books", "BTCUSDT")
    refs.subscribe("books", "BTCUSDT")
    assert len(acquired) == 1
    refs.unsubscribe("books", "BTCUSDT")
    assert released == []
    refs.unsubscribe("books", "BTCUSDT")
    assert released == [[("books", "BTCUSDT")]]


# -- OrderBookMerger -------------------------------------------------------
def _book_row(asks, bids, seq, pseq=0, action="snapshot") -> str:
    return json.dumps(
        {
            "action": action,
            "arg": {"instType": CAT, "channel": "books", "instId": "BTCUSDT"},
            "data": [{"asks": asks, "bids": bids, "seq": seq, "pseq": pseq, "ts": "1"}],
        }
    )


def test_orderbook_snapshot_then_update() -> None:
    s = _stream()
    asyncio.run(s._handle_frame(
        None, _book_row([["101", "5"], ["102", "3"]], [["100", "4"], ["99", "2"]], 10)))
    book = s.orderbook("BTCUSDT")
    assert book is not None
    assert book["asks"] == [(101.0, 5.0), (102.0, 3.0)]
    assert book["bids"] == [(100.0, 4.0), (99.0, 2.0)]
    assert book["seq"] == 10

    asyncio.run(s._handle_frame(
        None, _book_row([["101", "6"], ["102", "0"]], [["100", "0"]], 11, pseq=10, action="update")))
    book = s.orderbook("BTCUSDT")
    assert book["asks"] == [(101.0, 6.0)]
    assert book["bids"] == [(99.0, 2.0)]
    assert book["seq"] == 11


def test_orderbook_seq_gap_resubscribes() -> None:
    s = _stream()
    sent: list[str] = []

    class _Ws:
        async def send(self, text: str) -> None:
            sent.append(text)

    asyncio.run(s._handle_frame(
        None, _book_row([["101", "5"]], [["100", "4"]], 10)))
    s._ws = _Ws()  # inject a live connection so the resubscribe request is sent
    asyncio.run(s._handle_frame(
        None, _book_row([["102", "3"]], [], 20, pseq=99, action="update")))
    # gap detected -> should have requested a re-subscribe
    assert any('"subscribe"' in m and '"books"' in m and "BTCUSDT" in m for m in sent)
    # book is cleared pending a fresh snapshot
    assert s.orderbook("BTCUSDT") == {"asks": [], "bids": [], "seq": None}


# -- ticker / trade / mark / funding --------------------------------------
def test_ticker_mirror() -> None:
    s = _stream()
    frame = json.dumps({
        "action": "update",
        "arg": {"instType": CAT, "channel": "ticker", "instId": "default"},
        "data": [{"instId": "BTCUSDT", "lastPr": "123.4", "price24hPcnt": "-0.01"}],
    })
    asyncio.run(s._handle_frame(None, frame))
    t = s.ticker("BTCUSDT")
    assert t is not None and t["lastPr"] == "123.4"
    assert s.tickers()["BTCUSDT"]["price24hPcnt"] == "-0.01"


def test_trade_ring_buffer() -> None:
    s = _stream(max_trades=3)
    for i in range(5):
        frame = json.dumps({
            "action": "update",
            "arg": {"instType": CAT, "channel": "trade", "instId": "BTCUSDT"},
            "data": [{"instId": "BTCUSDT", "price": str(i), "size": "1", "side": "buy", "ts": str(i)}],
        })
        asyncio.run(s._handle_frame(None, frame))
    trades = s.trades("BTCUSDT")
    assert [t["price"] for t in trades] == ["2", "3", "4"]


def test_mark_and_funding_mirror() -> None:
    s = _stream()
    asyncio.run(s._handle_frame(None, json.dumps({
        "action": "update",
        "arg": {"instType": CAT, "channel": "mark-price", "instId": "BTCUSDT"},
        "data": [{"instId": "BTCUSDT", "markPrice": "123.0"}]})))
    asyncio.run(s._handle_frame(None, json.dumps({
        "action": "update",
        "arg": {"instType": CAT, "channel": "funding-time", "instId": "BTCUSDT"},
        "data": [{"instId": "BTCUSDT", "fundingRate": "0.0001"}]})))
    assert s.mark_prices()["BTCUSDT"]["markPrice"] == "123.0"
    assert s.funding()["BTCUSDT"]["fundingRate"] == "0.0001"


# -- listeners -------------------------------------------------------------
def test_listener_receives_events() -> None:
    s = _stream()
    events: list[tuple] = []
    s.add_listener(lambda ch, sym, action, data: events.append((ch, sym, action)))
    asyncio.run(s._handle_frame(None, json.dumps({
        "action": "update",
        "arg": {"instType": CAT, "channel": "trade", "instId": "BTCUSDT"},
        "data": [{"instId": "BTCUSDT", "price": "1", "size": "1", "side": "buy", "ts": "1"}]})))
    assert ("trade", "BTCUSDT", "update") in events
    s.remove_listener(lambda *_: None)  # no-op removal of a non-member
    assert len(events) == 1


def test_ping_replies_pong() -> None:
    s = _stream()
    sent: list[str] = []

    class _Ws:
        async def send(self, text: str) -> None:
            sent.append(text)

    asyncio.run(s._handle_frame(_Ws(), '{"event":"ping"}'))
    assert sent == [PONG_FRAME]


def test_unsubscribe_drops_mirror() -> None:
    s = _stream()
    asyncio.run(s._handle_frame(None, json.dumps({
        "action": "update",
        "arg": {"instType": CAT, "channel": "trade", "instId": "BTCUSDT"},
        "data": [{"instId": "BTCUSDT", "price": "1", "size": "1", "side": "buy", "ts": "1"}]})))
    assert len(s.trades("BTCUSDT")) == 1
    s.subscribe("trade", "BTCUSDT")  # establish the refcount
    s.unsubscribe("trade", "BTCUSDT")
    assert s.trades("BTCUSDT") == []


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All streamhub tests passed.")


if __name__ == "__main__":
    _run_all()
