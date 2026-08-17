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
SPOT = "SPOT"


def _stream(**kw) -> MarketStream:  # noqa: ANN003
    defaults = dict(
        url="ws://127.0.0.1:1",
        categories=[CAT],
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
    refs.subscribe(CAT, "books", "BTCUSDT")
    refs.subscribe(CAT, "books", "BTCUSDT")
    assert len(acquired) == 1
    refs.unsubscribe(CAT, "books", "BTCUSDT")
    assert released == []
    refs.unsubscribe(CAT, "books", "BTCUSDT")
    assert released == [[(CAT, "books", "BTCUSDT")]]


def test_refcount_category_isolation() -> None:
    acquired: list[list] = []
    released: list[list] = []
    refs = RefCountSubscription(acquired.append, released.append)
    refs.subscribe(CAT, "books", "BTCUSDT")
    refs.subscribe(SPOT, "books", "BTCUSDT")
    assert len(acquired) == 2
    refs.unsubscribe(CAT, "books", "BTCUSDT")
    assert len(released) == 1
    assert released[0] == [(CAT, "books", "BTCUSDT")]


# -- OrderBookMerger -------------------------------------------------------
def _book_row(asks, bids, seq, pseq=0, action="snapshot", cat=CAT) -> str:
    return json.dumps(
        {
            "action": action,
            "arg": {"instType": cat, "channel": "books", "instId": "BTCUSDT"},
            "data": [{"asks": asks, "bids": bids, "seq": seq, "pseq": pseq, "ts": "1"}],
        }
    )


def test_orderbook_snapshot_then_update() -> None:
    s = _stream()
    asyncio.run(s._handle_frame(
        None, _book_row([["101", "5"], ["102", "3"]], [["100", "4"], ["99", "2"]], 10), CAT))
    book = s.orderbook("BTCUSDT")
    assert book is not None
    assert book["asks"] == [(101.0, 5.0), (102.0, 3.0)]
    assert book["bids"] == [(100.0, 4.0), (99.0, 2.0)]
    assert book["seq"] == 10

    asyncio.run(s._handle_frame(
        None, _book_row([["101", "6"], ["102", "0"]], [["100", "0"]], 11, pseq=10, action="update"), CAT))
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
        None, _book_row([["101", "5"]], [["100", "4"]], 10), CAT))
    s._ws = {CAT: _Ws()}  # inject a live connection so the resubscribe request is sent
    asyncio.run(s._handle_frame(
        None, _book_row([["102", "3"]], [], 20, pseq=99, action="update"), CAT))
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
    asyncio.run(s._handle_frame(None, frame, CAT))
    t = s.ticker("BTCUSDT")
    assert t is not None and t["lastPr"] == "123.4"
    assert s.tickers()["USDT-FUTURES:BTCUSDT"]["price24hPcnt"] == "-0.01"


def test_trade_ring_buffer() -> None:
    s = _stream(max_trades=3)
    for i in range(5):
        frame = json.dumps({
            "action": "update",
            "arg": {"instType": CAT, "channel": "trade", "instId": "BTCUSDT"},
            "data": [{"instId": "BTCUSDT", "price": str(i), "size": "1", "side": "buy", "ts": str(i)}],
        })
        asyncio.run(s._handle_frame(None, frame, CAT))
    trades = s.trades("BTCUSDT")
    assert [t["price"] for t in trades] == ["2", "3", "4"]


def test_mark_and_funding_mirror() -> None:
    s = _stream()
    asyncio.run(s._handle_frame(None, json.dumps({
        "action": "update",
        "arg": {"instType": CAT, "channel": "mark-price", "instId": "BTCUSDT"},
        "data": [{"instId": "BTCUSDT", "markPrice": "123.0"}]}), CAT))
    asyncio.run(s._handle_frame(None, json.dumps({
        "action": "update",
        "arg": {"instType": CAT, "channel": "funding-time", "instId": "BTCUSDT"},
        "data": [{"instId": "BTCUSDT", "fundingRate": "0.0001"}]}), CAT))
    assert s.mark_prices()["USDT-FUTURES:BTCUSDT"]["markPrice"] == "123.0"
    assert s.funding()["USDT-FUTURES:BTCUSDT"]["fundingRate"] == "0.0001"


# -- listeners -------------------------------------------------------------
def test_listener_receives_events() -> None:
    s = _stream()
    events: list[tuple] = []
    s.add_listener(lambda cat, ch, sym, action, data: events.append((cat, ch, sym, action)))
    asyncio.run(s._handle_frame(None, json.dumps({
        "action": "update",
        "arg": {"instType": CAT, "channel": "trade", "instId": "BTCUSDT"},
        "data": [{"instId": "BTCUSDT", "price": "1", "size": "1", "side": "buy", "ts": "1"}]}), CAT))
    assert (CAT, "trade", "BTCUSDT", "update") in events
    s.remove_listener(lambda *_: None)  # no-op removal of a non-member
    assert len(events) == 1


def test_ping_replies_pong() -> None:
    s = _stream()
    sent: list[str] = []

    class _Ws:
        async def send(self, text: str) -> None:
            sent.append(text)

    asyncio.run(s._handle_frame(_Ws(), '{"event":"ping"}', CAT))
    assert sent == [PONG_FRAME]


def test_unsubscribe_drops_mirror() -> None:
    s = _stream()
    asyncio.run(s._handle_frame(None, json.dumps({
        "action": "update",
        "arg": {"instType": CAT, "channel": "trade", "instId": "BTCUSDT"},
        "data": [{"instId": "BTCUSDT", "price": "1", "size": "1", "side": "buy", "ts": "1"}]}), CAT))
    assert len(s.trades("BTCUSDT")) == 1
    s.subscribe("trade", "BTCUSDT", CAT)  # establish the refcount
    s.unsubscribe("trade", "BTCUSDT", CAT)
    assert s.trades("BTCUSDT") == []


# -- multi-category --------------------------------------------------------
def test_multi_category_mirrors_isolated() -> None:
    s = _stream(categories=[CAT, SPOT])
    # futures books
    asyncio.run(s._handle_frame(None, _book_row([["101", "5"]], [["100", "4"]], 10, cat=CAT), CAT))
    # spot books for the same symbol
    asyncio.run(s._handle_frame(None, _book_row([["201", "9"]], [["200", "8"]], 5, cat=SPOT), SPOT))
    assert s.orderbook("BTCUSDT", category=CAT)["asks"] == [(101.0, 5.0)]
    assert s.orderbook("BTCUSDT", category=SPOT)["asks"] == [(201.0, 9.0)]


def test_multi_category_tickers_merged_and_filtered() -> None:
    s = _stream(categories=[CAT, SPOT])
    asyncio.run(s._handle_frame(None, json.dumps({
        "action": "update",
        "arg": {"instType": CAT, "channel": "ticker", "instId": "BTCUSDT"},
        "data": [{"instId": "BTCUSDT", "lastPr": "100.0"}]}), CAT))
    asyncio.run(s._handle_frame(None, json.dumps({
        "action": "update",
        "arg": {"instType": SPOT, "channel": "ticker", "instId": "BTCUSDT"},
        "data": [{"instId": "BTCUSDT", "lastPr": "101.0"}]}), SPOT))
    all_t = s.tickers()
    # merged view keys by "category:instId" and keeps both category entries
    assert all_t["USDT-FUTURES:BTCUSDT"]["lastPr"] == "100.0"
    assert all_t["SPOT:BTCUSDT"]["lastPr"] == "101.0"
    assert all_t["SPOT:BTCUSDT"].get("category") == SPOT
    spot_t = s.tickers(SPOT)
    assert spot_t["BTCUSDT"]["lastPr"] == "101.0"
    fut_t = s.tickers(CAT)
    assert fut_t["BTCUSDT"]["lastPr"] == "100.0"


def test_instrument_normalization() -> None:
    from market_data.streamhub import _normalize_instrument

    v2 = {"symbol": "BTCUSDT", "pricePlace": "2", "volumePlace": "4", "symbolStatus": "online"}
    norm = _normalize_instrument(v2)
    assert norm is not None
    assert norm["instId"] == "BTCUSDT"
    assert norm["pricePrecision"] == "2"
    assert norm["quantityPrecision"] == "4"
    assert norm["symbolType"] == "crypto"

    v3 = {"symbol": "XAUUSD", "pricePrecision": "2", "quantityPrecision": "3", "symbolType": "metal"}
    norm3 = _normalize_instrument(v3)
    assert norm3["symbolType"] == "metal"


def test_instrument_mirror_per_category() -> None:
    rows: list[list[dict]] = [[], []]

    def fake_fetch(category: str) -> list[dict]:
        idx = 0 if category == CAT else 1
        return rows[idx]

    s = _stream(categories=[CAT, SPOT], fetch_instruments=fake_fetch)
    rows[0] = [{"symbol": "BTCUSDT", "pricePrecision": "1", "symbolType": "crypto"}]
    rows[1] = [{"symbol": "XAUUSD", "pricePrecision": "2", "symbolType": "metal"}]
    asyncio.run(s._refresh_instruments(CAT))
    asyncio.run(s._refresh_instruments(SPOT))
    assert s.instruments(CAT)["BTCUSDT"]["symbolType"] == "crypto"
    assert s.instruments(SPOT)["XAUUSD"]["symbolType"] == "metal"
    all_i = s.instruments()
    assert all_i["USDT-FUTURES:BTCUSDT"]["category"] == CAT
    assert all_i["SPOT:XAUUSD"]["category"] == SPOT


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All streamhub tests passed.")


if __name__ == "__main__":
    _run_all()
