"""Multi-channel Bitget public WS hub for the exchange terminal.

Extends the single-pipe candle stream (realtime.py) with the channels needed
by an exchange-style terminal:

- ``ticker``      full-market 24h stats (instId: default)
- ``books``       full-depth order book (snapshot + incremental merge)
- ``trade``       recent trades (ring buffer per symbol)
- ``mark-price``  mark price mirror
- ``funding-time`` funding rate mirror

Each channel keeps an in-memory mirror that the REST snapshot endpoints read
from, and emits incremental events to WebSocket subscribers. Subscriptions are
refcounted: the first external subscriber triggers a Bitget subscribe, the
last unsubscribe releases the channel.

The candle pipeline in ``realtime.py`` is intentionally untouched; this module
runs its own connection loop so real-time klines keep working independently.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from collections import deque
from typing import Any, Callable

from websockets.asyncio.client import ClientConnection, connect

logger = logging.getLogger(__name__)

PING_FRAME = '{"event":"ping"}'
PONG_FRAME = '{"event":"pong"}'

MAX_TRADES_PER_SYMBOL = 200
MAX_DEPTH_LEVELS = 400
CONTRACTS_URL = "https://api.bitget.com/api/v2/mix/market/contracts"
TICKERS_URL = "https://api.bitget.com/api/v2/mix/market/tickers"

# Bitget v2 has no dedicated mark-price / funding-time channels; both are
# embedded in the ticker frame. Logical channels map to the ticker channel.
CHANNEL_ALIASES = {
    "mark-price": "ticker",
    "funding-time": "ticker",
    "ticker": "ticker",
}


def _default_fetch_instruments(category: str) -> list[dict]:
    """Fetch contract static specs (precision/status) from the Bitget REST API."""
    import httpx

    resp = httpx.get(CONTRACTS_URL, params={"productType": category}, timeout=10.0)
    resp.raise_for_status()
    body = resp.json()
    if body.get("code") != "00000":
        raise RuntimeError(body.get("msg", "contracts fetch failed"))
    return body.get("data", [])


def _default_fetch_tickers(category: str) -> list[dict]:
    """Fetch the full-market ticker snapshot from the Bitget REST API.

    Bitget's public WS ticker channel requires one instId per subscription and
    does not support a wildcard "default"; the REST endpoint returns all
    contracts at once and is used to seed the mirror.
    """
    import httpx

    resp = httpx.get(TICKERS_URL, params={"productType": category}, timeout=10.0)
    resp.raise_for_status()
    body = resp.json()
    if body.get("code") != "00000":
        raise RuntimeError(body.get("msg", "tickers fetch failed"))
    return body.get("data", [])


class RefCountSubscription:
    """Refcount a set of (channel, symbol) keys against an external resource.

    ``on_acquire(keys)`` fires when a key crosses 0 -> 1 (subscribe), and
    ``on_release(keys)`` when it crosses 1 -> 0 (unsubscribe).
    """

    def __init__(
        self,
        on_acquire: Callable[[list[tuple[str, str]]], None],
        on_release: Callable[[list[tuple[str, str]]], None],
    ) -> None:
        self._counts: dict[tuple[str, str], int] = {}
        self._on_acquire = on_acquire
        self._on_release = on_release

    def subscribe(self, channel: str, symbol: str) -> None:
        key = (channel, symbol)
        prev = self._counts.get(key, 0)
        self._counts[key] = prev + 1
        if prev == 0:
            self._on_acquire([key])

    def unsubscribe(self, channel: str, symbol: str) -> None:
        key = (channel, symbol)
        n = self._counts.get(key, 0)
        if n <= 0:
            return
        self._counts[key] = n - 1
        if n == 1:
            del self._counts[key]
            self._on_release([key])

    def keys(self) -> list[tuple[str, str]]:
        return list(self._counts.keys())


class OrderBookMerger:
    """Merge Bitget ``books`` snapshot/update frames into a full-depth book.

    ``size="0"`` removes a price level. ``seq``/``pseq`` detect gaps; on a gap
    the caller is told to re-subscribe for a fresh snapshot.
    """

    def __init__(self, max_levels: int = MAX_DEPTH_LEVELS) -> None:
        self.max_levels = max_levels
        self.asks: dict[float, float] = {}
        self.bids: dict[float, float] = {}
        self.seq: int | None = None

    def reset(self) -> None:
        self.asks.clear()
        self.bids.clear()
        self.seq = None

    def apply_snapshot(self, asks: list, bids: list, seq: Any) -> None:
        self.reset()
        for price, size in asks:
            qty = float(size)
            if qty > 0:
                self.asks[float(price)] = qty
        for price, size in bids:
            qty = float(size)
            if qty > 0:
                self.bids[float(price)] = qty
        self.seq = int(seq) if seq is not None else None
        self._trim()

    def apply_update(self, asks: list, bids: list, seq: Any, pseq: Any) -> bool:
        """Apply an incremental update. Returns False when a re-snapshot is needed."""
        if self.seq is not None and pseq is not None and int(pseq) != self.seq:
            logger.warning("OrderBook seq gap: prev=%s pseq=%s", self.seq, pseq)
            return False
        for price, size in asks:
            qty = float(size)
            if qty <= 0:
                self.asks.pop(float(price), None)
            else:
                self.asks[float(price)] = qty
        for price, size in bids:
            qty = float(size)
            if qty <= 0:
                self.bids.pop(float(price), None)
            else:
                self.bids[float(price)] = qty
        self.seq = int(seq) if seq is not None else self.seq
        self._trim()
        return True

    def _trim(self) -> None:
        """Keep the depth bounded by dropping the farthest levels from the spread."""
        if len(self.asks) <= self.max_levels and len(self.bids) <= self.max_levels:
            return
        asks = sorted(self.asks)
        for price in asks[: len(asks) - self.max_levels]:
            del self.asks[price]
        bids = sorted(self.bids, reverse=True)
        for price in bids[: len(bids) - self.max_levels]:
            del self.bids[price]

    def levels(self, max_levels: int | None = None) -> dict:
        n = max_levels or self.max_levels
        asks = sorted(self.asks.items())[:n]
        bids = sorted(self.bids.items(), reverse=True)[:n]
        return {"asks": asks, "bids": bids, "seq": self.seq}


class MarketStream:
    """Dynamic multi-channel Bitget public WS stream with refcount subscriptions.

    Not thread-safe by itself; a single event loop drives the connection.
    ``latest_*`` snapshot readers take an internal lock so they may be called
    from any thread.
    """

    def __init__(
        self,
        *,
        url: str,
        category: str,
        heartbeat_seconds: float = 30.0,
        reconnect_seconds: float = 5.0,
        max_trades: int = MAX_TRADES_PER_SYMBOL,
        max_depth_levels: int = MAX_DEPTH_LEVELS,
        fetch_instruments: Callable[[str], list[dict]] | None = None,
        fetch_tickers: Callable[[str], list[dict]] | None = None,
    ) -> None:
        self._url = url
        self._category = category
        self._heartbeat = heartbeat_seconds
        self._reconnect = reconnect_seconds
        self._max_trades = max_trades
        self._max_depth = max_depth_levels
        self._fetch_instruments = fetch_instruments or _default_fetch_instruments
        self._fetch_tickers = fetch_tickers or _default_fetch_tickers

        self._lock = threading.Lock()
        self._task: asyncio.Task | None = None
        self._stopping = False
        self._ws: ClientConnection | None = None
        self._listeners: list[Callable[[str, str, str, Any], None]] = []

        self._refs = RefCountSubscription(self._acquire, self._release)
        self._tickers: dict[str, dict] = {}
        self._books: dict[str, OrderBookMerger] = {}
        self._trades: dict[str, deque] = {}
        self._mark: dict[str, dict] = {}
        self._funding: dict[str, dict] = {}
        self._instruments: dict[str, dict] = {}

    # -- lifecycle ---------------------------------------------------------
    def start(self) -> None:
        if self._task is not None:
            return
        self._stopping = False
        self._task = asyncio.create_task(self._run_loop())
        asyncio.get_running_loop().create_task(self._refresh_instruments())
        asyncio.get_running_loop().create_task(self._refresh_tickers())

    async def stop(self) -> None:
        self._stopping = True
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    # -- external subscription ---------------------------------------------
    def subscribe(self, channel: str, symbol: str) -> None:
        self._refs.subscribe(CHANNEL_ALIASES.get(channel, channel), symbol)

    def unsubscribe(self, channel: str, symbol: str) -> None:
        self._refs.unsubscribe(CHANNEL_ALIASES.get(channel, channel), symbol)

    def add_listener(self, listener: Callable[[str, str, str, Any], None]) -> None:
        self._listeners.append(listener)

    def remove_listener(self, listener: Callable[[str, str, str, Any], None]) -> None:
        if listener in self._listeners:
            self._listeners.remove(listener)

    # -- refcount callbacks -------------------------------------------------
    def _acquire(self, keys: list[tuple[str, str]]) -> None:
        for channel, symbol in keys:
            self._request("subscribe", channel, symbol)

    def _release(self, keys: list[tuple[str, str]]) -> None:
        for channel, symbol in keys:
            self._request("unsubscribe", channel, symbol)
            self._drop_channel(channel, symbol)

    def _request(self, op: str, channel: str, symbol: str) -> None:
        payload = json.dumps({"op": op, "args": [{"instType": self._category, "channel": channel, "instId": symbol}]})
        ws = self._ws
        if ws is not None and not getattr(ws, "closed", False):
            loop = asyncio.get_running_loop()
            loop.create_task(self._safe_send(ws, payload))

    def _drop_channel(self, channel: str, symbol: str) -> None:
        with self._lock:
            if channel == "ticker":
                # keep the ticker mirror (it may be reseeded via REST); nothing
                # symbol-scoped to drop
                return
            self._books.pop(symbol, None)
            self._trades.pop(symbol, None)
            self._mark.pop(symbol, None)
            self._funding.pop(symbol, None)
    # -- connection loop ----------------------------------------------------
    async def _run_loop(self) -> None:
        while not self._stopping:
            try:
                async with connect(self._url, open_timeout=10) as ws:
                    self._ws = ws
                    logger.info("MarketStream connected: %s", self._url)
                    await self._subscribe_all(ws)
                    await self._read_loop(ws)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                logger.warning("MarketStream connection failed: %s", exc)
            finally:
                self._ws = None
            if not self._stopping:
                await asyncio.sleep(self._reconnect)

    async def _subscribe_all(self, ws: ClientConnection) -> None:
        keys = self._refs.keys()
        if not keys:
            return
        args = [
            {"instType": self._category, "channel": ch, "instId": sym}
            for ch, sym in keys
        ]
        await self._send_chunked(ws, {"op": "subscribe", "args": args})
        logger.info("MarketStream subscribed %d channels.", len(args))

    async def _send_chunked(self, ws: ClientConnection, msg: dict) -> None:
        """Send args in chunks to stay under the ~4096-byte message limit."""
        args = msg.get("args", [])
        chunk: list[dict] = []
        for arg in args:
            chunk.append(arg)
            if len(json.dumps({"op": msg["op"], "args": chunk})) >= 3000:
                await self._safe_send(ws, json.dumps({"op": msg["op"], "args": chunk}))
                chunk = []
        if chunk:
            await self._safe_send(ws, json.dumps({"op": msg["op"], "args": chunk}))

    async def _read_loop(self, ws: ClientConnection) -> None:
        silent = 0
        while True:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=self._heartbeat)
            except asyncio.TimeoutError:
                silent += 1
                if silent >= 2:
                    logger.warning("MarketStream silent; forcing reconnect.")
                    raise ConnectionError("no messages within heartbeat window") from None
                await self._safe_send(ws, PING_FRAME)
                continue
            silent = 0
            await self._handle_frame(ws, raw)

    async def _safe_send(self, ws: ClientConnection, text: str) -> None:
        try:
            await ws.send(text)
        except Exception:  # noqa: BLE001 - surfaced by the read loop on the next recv
            pass

    # -- frame handling -----------------------------------------------------
    async def _handle_frame(self, ws: ClientConnection, raw: Any) -> None:
        try:
            msg = json.loads(raw)
        except (TypeError, ValueError):
            return
        if not isinstance(msg, dict):
            return
        event = msg.get("event")
        if event == "ping":
            await self._safe_send(ws, PONG_FRAME)
            return
        if event in ("subscribe", "unsubscribe", "error"):
            if event == "error":
                logger.warning("MarketStream error frame: %s", msg)
            return
        action = msg.get("action")
        if action not in ("snapshot", "update"):
            return
        arg = msg.get("arg") or {}
        channel = arg.get("channel") or ""
        inst_id = arg.get("instId") or ""
        rows = msg.get("data") or []
        if not channel:
            return
        self._route(channel, inst_id, action, rows)

    def _route(self, channel: str, inst_id: str, action: str, rows: list) -> None:
        with self._lock:
            if channel == "ticker":
                for row in rows:
                    sid = row.get("instId") or inst_id
                    self._tickers[sid] = row
                    if row.get("markPrice") is not None:
                        self._mark[sid] = row
                    if row.get("fundingRate") is not None or row.get("nextFundingTime") is not None:
                        self._funding[sid] = row
                self._emit("ticker", inst_id, action, rows)
                self._emit("mark-price", inst_id, action, rows)
                self._emit("funding-time", inst_id, action, rows)
            elif channel == "books":
                for row in rows:
                    book = self._books.setdefault(inst_id, OrderBookMerger(self._max_depth))
                    if action == "snapshot":
                        book.apply_snapshot(row.get("asks", []), row.get("bids", []), row.get("seq"))
                    elif not book.apply_update(
                        row.get("asks", []), row.get("bids", []), row.get("seq"), row.get("pseq")
                    ):
                        logger.warning("MarketStream books gap for %s; re-subscribing.", inst_id)
                        book.reset()
                        self._request("subscribe", "books", inst_id)
                    self._emit("books", inst_id, action, book.levels())
            elif channel == "trade":
                buf = self._trades.setdefault(inst_id, deque(maxlen=self._max_trades))
                for row in rows:
                    buf.append(row)
                self._emit("trade", inst_id, "update", rows)
            elif channel == "mark-price":
                for row in rows:
                    self._mark[row.get("instId") or inst_id] = row
                self._emit("mark-price", inst_id, action, rows)
            elif channel == "funding-time":
                for row in rows:
                    self._funding[row.get("instId") or inst_id] = row
                self._emit("funding-time", inst_id, action, rows)

    def _emit(self, channel: str, symbol: str, action: str, data: Any) -> None:
        for listener in list(self._listeners):
            try:
                listener(channel, symbol, action, data)
            except Exception:  # noqa: BLE001 - one bad listener must not break the hub
                logger.exception("MarketStream listener failed")

    # -- snapshot readers (any thread) -------------------------------------
    def tickers(self) -> dict[str, dict]:
        with self._lock:
            return {k: dict(v) for k, v in self._tickers.items()}

    def ticker(self, symbol: str) -> dict | None:
        with self._lock:
            t = self._tickers.get(symbol)
            return dict(t) if t else None

    def orderbook(self, symbol: str) -> dict | None:
        with self._lock:
            book = self._books.get(symbol)
            if book is None:
                return None
            return book.levels()

    def trades(self, symbol: str, limit: int | None = None) -> list[dict]:
        with self._lock:
            buf = self._trades.get(symbol)
            if not buf:
                return []
            items = list(buf)
            return items[-limit:] if limit is not None else items

    def mark_prices(self) -> dict[str, dict]:
        with self._lock:
            return {k: dict(v) for k, v in self._mark.items()}

    def funding(self) -> dict[str, dict]:
        with self._lock:
            return {k: dict(v) for k, v in self._funding.items()}

    def instruments(self) -> dict[str, dict]:
        with self._lock:
            return {k: dict(v) for k, v in self._instruments.items()}

    def instrument(self, symbol: str) -> dict | None:
        with self._lock:
            inst = self._instruments.get(symbol)
            return dict(inst) if inst else None

    async def _refresh_instruments(self) -> None:
        try:
            rows = await asyncio.to_thread(self._fetch_instruments, self._category)
        except Exception as exc:  # noqa: BLE001
            logger.warning("MarketStream instruments refresh failed: %s", exc)
            return
        with self._lock:
            self._instruments = {
                (row.get("symbol") or row.get("instId")): row
                for row in rows
                if row.get("symbol") or row.get("instId")
            }
        logger.info("MarketStream instruments cached: %d", len(self._instruments))

    async def _refresh_tickers(self) -> None:
        try:
            rows = await asyncio.to_thread(self._fetch_tickers, self._category)
        except Exception as exc:  # noqa: BLE001
            logger.warning("MarketStream tickers refresh failed: %s", exc)
            return
        with self._lock:
            for row in rows:
                # REST /tickers uses `symbol`; WS ticker frames use `instId`.
                # Normalize so the mirror is keyed uniformly by instId.
                sid = row.get("instId") or row.get("symbol")
                if not sid:
                    continue
                row.setdefault("instId", sid)
                row.setdefault("symbol", sid)
                self._tickers[sid] = row
        logger.info("MarketStream tickers seeded: %d", len(rows))
