"""Multi-category Bitget public WS hub for the exchange terminal.

Extends the single-pipe candle stream (realtime.py) with the channels needed
by an exchange-style terminal across all Bitget product categories:

- ``ticker``      full-market 24h stats (per category)
- ``books``       full-depth order book (snapshot + incremental merge)
- ``trade``       recent trades (ring buffer per symbol)
- ``mark-price``  mark price mirror
- ``funding-time`` funding rate mirror

Each channel keeps an in-memory mirror per category (SPOT / MARGIN /
USDT-FUTURES / USDC-FUTURES / COIN-FUTURES) that the REST snapshot endpoints
read from, and emits incremental events to WebSocket subscribers. Subscriptions
are refcounted: the first external subscriber triggers a Bitget subscribe, the
last unsubscribe releases the channel.

The candle pipeline in ``realtime.py`` is intentionally untouched; this module
runs its own per-category connection loops so real-time klines keep working
independently.
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
INSTRUMENTS_V3_URL = "https://api.bitget.com/api/v3/market/instruments"

# Bitget v2 has no dedicated mark-price / funding-time channels; both are
# embedded in the ticker frame. Logical channels map to the ticker channel.
CHANNEL_ALIASES = {
    "mark-price": "ticker",
    "funding-time": "ticker",
    "ticker": "ticker",
}


def _default_fetch_instruments(category: str) -> list[dict]:
    """Fetch instrument static specs from the Bitget v3 API (all categories)."""
    import httpx

    resp = httpx.get(INSTRUMENTS_V3_URL, params={"category": category}, timeout=10.0)
    resp.raise_for_status()
    body = resp.json()
    if body.get("code") != "00000":
        raise RuntimeError(body.get("msg", "instruments fetch failed"))
    return body.get("data", [])


def _default_fetch_tickers(category: str) -> list[dict]:
    """Fetch the full-market ticker snapshot from the Bitget REST API.

    Bitget's public WS ticker channel requires one instId per subscription and
    does not support a wildcard "default"; the REST endpoint returns all
    contracts at once and is used to seed the mirror. SPOT uses the spot
    endpoint; the futures categories share the mix endpoint.
    """
    import httpx

    from market_data.models import category_ticker_api

    url = category_ticker_api(category)
    params = {"productType": category} if "mix" in url else {}
    resp = httpx.get(url, params=params, timeout=10.0)
    resp.raise_for_status()
    body = resp.json()
    if body.get("code") != "00000":
        raise RuntimeError(body.get("msg", "tickers fetch failed"))
    return body.get("data", [])


class RefCountSubscription:
    """Refcount a set of (category, channel, symbol) keys against a resource.

    ``on_acquire(keys)`` fires when a key crosses 0 -> 1 (subscribe), and
    ``on_release(keys)`` when it crosses 1 -> 0 (unsubscribe).
    """

    def __init__(
        self,
        on_acquire: Callable[[list[tuple[str, str, str]]], None],
        on_release: Callable[[list[tuple[str, str, str]]], None],
    ) -> None:
        self._counts: dict[tuple[str, str, str], int] = {}
        self._on_acquire = on_acquire
        self._on_release = on_release

    def subscribe(self, category: str, channel: str, symbol: str) -> None:
        key = (category, channel, symbol)
        prev = self._counts.get(key, 0)
        self._counts[key] = prev + 1
        if prev == 0:
            self._on_acquire([key])

    def unsubscribe(self, category: str, channel: str, symbol: str) -> None:
        key = (category, channel, symbol)
        n = self._counts.get(key, 0)
        if n <= 0:
            return
        self._counts[key] = n - 1
        if n == 1:
            del self._counts[key]
            self._on_release([key])

    def keys(self) -> list[tuple[str, str, str]]:
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


def _normalize_instrument(row: dict) -> dict | None:
    """Normalize v2/v3 instrument field differences into one uniform shape.

    Returns None when the row has no usable symbol/instId.
    """
    sid = row.get("symbol") or row.get("instId")
    if not sid:
        return None
    out = dict(row)
    out.setdefault("instId", sid)
    out.setdefault("symbol", sid)
    # v2 contracts: pricePlace/volumePlace; v3 instruments: pricePrecision/quantityPrecision
    if "pricePlace" in out and "pricePrecision" not in out:
        out["pricePrecision"] = out["pricePlace"]
    if "volumePlace" in out and "quantityPrecision" not in out:
        out["quantityPrecision"] = out["volumePlace"]
    out.setdefault("symbolType", "crypto")
    out.setdefault("isRwa", "NO")
    out.setdefault("isReality", "no")
    return out


def _normalize_ticker(row: dict) -> dict | None:
    """Normalize REST ticker symbol/instId so the mirror is keyed by instId."""
    sid = row.get("instId") or row.get("symbol")
    if not sid:
        return None
    out = dict(row)
    out.setdefault("instId", sid)
    out.setdefault("symbol", sid)
    return out


class MarketStream:
    """Dynamic multi-category Bitget public WS stream with refcount subscriptions.

    One connection loop runs per category; each uses its own ``instType``.
    ``latest_*`` snapshot readers take an internal lock so they may be called
    from any thread.
    """

    def __init__(
        self,
        *,
        url: str,
        categories: list[str],
        heartbeat_seconds: float = 30.0,
        reconnect_seconds: float = 5.0,
        max_trades: int = MAX_TRADES_PER_SYMBOL,
        max_depth_levels: int = MAX_DEPTH_LEVELS,
        fetch_instruments: Callable[[str], list[dict]] | None = None,
        fetch_tickers: Callable[[str], list[dict]] | None = None,
    ) -> None:
        self._url = url
        self._categories = list(categories)
        self._heartbeat = heartbeat_seconds
        self._reconnect = reconnect_seconds
        self._max_trades = max_trades
        self._max_depth = max_depth_levels
        self._fetch_instruments = fetch_instruments or _default_fetch_instruments
        self._fetch_tickers = fetch_tickers or _default_fetch_tickers

        self._lock = threading.Lock()
        self._tasks: dict[str, asyncio.Task] = {}
        self._stopping = False
        self._ws: dict[str, ClientConnection | None] = {}
        self._listeners: list[Callable[[str, str, str, str, Any], None]] = []

        self._refs = RefCountSubscription(self._acquire, self._release)
        self._tickers: dict[str, dict[str, dict]] = {}
        self._books: dict[str, dict[str, OrderBookMerger]] = {}
        self._trades: dict[str, dict[str, deque]] = {}
        self._mark: dict[str, dict[str, dict]] = {}
        self._funding: dict[str, dict[str, dict]] = {}
        self._instruments: dict[str, dict[str, dict]] = {}
        for cat in self._categories:
            self._tickers[cat] = {}
            self._books[cat] = {}
            self._trades[cat] = {}
            self._mark[cat] = {}
            self._funding[cat] = {}
            self._instruments[cat] = {}

    # -- lifecycle ---------------------------------------------------------
    def start(self) -> None:
        if self._tasks:
            return
        self._stopping = False
        loop = asyncio.get_running_loop()
        for cat in self._categories:
            self._tasks[cat] = loop.create_task(self._run_loop(cat))
            loop.create_task(self._refresh_instruments(cat))
            loop.create_task(self._refresh_tickers(cat))

    async def stop(self) -> None:
        self._stopping = True
        tasks, self._tasks = self._tasks, {}
        for task in tasks.values():
            task.cancel()
        for task in tasks.values():
            try:
                await task
            except asyncio.CancelledError:
                pass

    # -- external subscription ---------------------------------------------
    def subscribe(self, channel: str, symbol: str, category: str = "USDT-FUTURES") -> None:
        if category not in self._tickers:
            raise ValueError(f"Unsupported category: {category!r}")
        self._refs.subscribe(category, CHANNEL_ALIASES.get(channel, channel), symbol)

    def unsubscribe(self, channel: str, symbol: str, category: str = "USDT-FUTURES") -> None:
        if category not in self._tickers:
            raise ValueError(f"Unsupported category: {category!r}")
        self._refs.unsubscribe(category, CHANNEL_ALIASES.get(channel, channel), symbol)

    def add_listener(self, listener: Callable[[str, str, str, str, Any], None]) -> None:
        self._listeners.append(listener)

    def remove_listener(self, listener: Callable[[str, str, str, str, Any], None]) -> None:
        if listener in self._listeners:
            self._listeners.remove(listener)

    # -- refcount callbacks -------------------------------------------------
    def _acquire(self, keys: list[tuple[str, str, str]]) -> None:
        for category, channel, symbol in keys:
            self._request("subscribe", category, channel, symbol)

    def _release(self, keys: list[tuple[str, str, str]]) -> None:
        for category, channel, symbol in keys:
            self._request("unsubscribe", category, channel, symbol)
            self._drop_channel(category, channel, symbol)

    def _request(self, op: str, category: str, channel: str, symbol: str) -> None:
        payload = json.dumps({"op": op, "args": [{"instType": category, "channel": channel, "instId": symbol}]})
        ws = self._ws.get(category)
        if ws is not None and not getattr(ws, "closed", False):
            loop = asyncio.get_running_loop()
            loop.create_task(self._safe_send(ws, payload))

    def _drop_channel(self, category: str, channel: str, symbol: str) -> None:
        with self._lock:
            if channel == "ticker":
                # keep the ticker mirror (it may be reseeded via REST); nothing
                # symbol-scoped to drop
                return
            self._books.get(category, {}).pop(symbol, None)
            self._trades.get(category, {}).pop(symbol, None)
            self._mark.get(category, {}).pop(symbol, None)
            self._funding.get(category, {}).pop(symbol, None)

    # -- connection loop ----------------------------------------------------
    async def _run_loop(self, category: str) -> None:
        while not self._stopping:
            try:
                async with connect(self._url, open_timeout=10) as ws:
                    self._ws[category] = ws
                    logger.info("MarketStream[%s] connected: %s", category, self._url)
                    await self._subscribe_all(ws, category)
                    await self._read_loop(ws, category)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                logger.warning("MarketStream[%s] connection failed: %s", category, exc)
            finally:
                self._ws[category] = None
            if not self._stopping:
                await asyncio.sleep(self._reconnect)

    async def _subscribe_all(self, ws: ClientConnection, category: str) -> None:
        keys = [k for k in self._refs.keys() if k[0] == category]
        if not keys:
            return
        args = [
            {"instType": cat, "channel": ch, "instId": sym}
            for cat, ch, sym in keys
        ]
        await self._send_chunked(ws, {"op": "subscribe", "args": args})
        logger.info("MarketStream[%s] subscribed %d channels.", category, len(args))

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

    async def _read_loop(self, ws: ClientConnection, category: str) -> None:
        silent = 0
        while True:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=self._heartbeat)
            except asyncio.TimeoutError:
                silent += 1
                if silent >= 2:
                    logger.warning("MarketStream[%s] silent; forcing reconnect.", category)
                    raise ConnectionError("no messages within heartbeat window") from None
                await self._safe_send(ws, PING_FRAME)
                continue
            silent = 0
            await self._handle_frame(ws, raw, category)

    async def _safe_send(self, ws: ClientConnection, text: str) -> None:
        try:
            await ws.send(text)
        except Exception:  # noqa: BLE001 - surfaced by the read loop on the next recv
            pass

    # -- frame handling -----------------------------------------------------
    async def _handle_frame(self, ws: ClientConnection, raw: Any, category: str) -> None:
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
                logger.warning("MarketStream[%s] error frame: %s", category, msg)
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
        self._route(category, channel, inst_id, action, rows)

    def _route(self, category: str, channel: str, inst_id: str, action: str, rows: list) -> None:
        with self._lock:
            if channel == "ticker":
                for row in rows:
                    sid = row.get("instId") or inst_id
                    row.setdefault("category", category)
                    self._tickers[category][sid] = row
                    if row.get("markPrice") is not None:
                        self._mark[category][sid] = row
                    if row.get("fundingRate") is not None or row.get("nextFundingTime") is not None:
                        self._funding[category][sid] = row
                self._emit(category, "ticker", inst_id, action, rows)
                self._emit(category, "mark-price", inst_id, action, rows)
                self._emit(category, "funding-time", inst_id, action, rows)
            elif channel == "books":
                for row in rows:
                    book = self._books[category].setdefault(inst_id, OrderBookMerger(self._max_depth))
                    if action == "snapshot":
                        book.apply_snapshot(row.get("asks", []), row.get("bids", []), row.get("seq"))
                    elif not book.apply_update(
                        row.get("asks", []), row.get("bids", []), row.get("seq"), row.get("pseq")
                    ):
                        logger.warning("MarketStream[%s] books gap for %s; re-subscribing.", category, inst_id)
                        book.reset()
                        self._request("subscribe", category, "books", inst_id)
                    self._emit(category, "books", inst_id, action, book.levels())
            elif channel == "trade":
                buf = self._trades[category].setdefault(inst_id, deque(maxlen=self._max_trades))
                for row in rows:
                    buf.append(row)
                self._emit(category, "trade", inst_id, "update", rows)
            elif channel == "mark-price":
                for row in rows:
                    self._mark[category][row.get("instId") or inst_id] = row
                self._emit(category, "mark-price", inst_id, action, rows)
            elif channel == "funding-time":
                for row in rows:
                    self._funding[category][row.get("instId") or inst_id] = row
                self._emit(category, "funding-time", inst_id, action, rows)

    def _emit(self, category: str, channel: str, symbol: str, action: str, data: Any) -> None:
        for listener in list(self._listeners):
            try:
                listener(category, channel, symbol, action, data)
            except Exception:  # noqa: BLE001 - one bad listener must not break the hub
                logger.exception("MarketStream listener failed")

    # -- snapshot readers (any thread) -------------------------------------
    def categories(self) -> list[str]:
        return list(self._categories)

    def tickers(self, category: str | None = None) -> dict[str, dict]:
        with self._lock:
            if category is not None:
                return {k: dict(v) for k, v in self._tickers.get(category, {}).items()}
            # merged view keyed by "category:instId" so the same symbol across
            # categories (e.g. BTCUSDT in SPOT and USDT-FUTURES) stays distinct
            merged: dict[str, dict] = {}
            for cat, mirror in self._tickers.items():
                for k, v in mirror.items():
                    row = dict(v)
                    row.setdefault("category", cat)
                    merged[f"{cat}:{k}"] = row
            return merged

    def ticker(self, symbol: str, category: str = "USDT-FUTURES") -> dict | None:
        with self._lock:
            t = self._tickers.get(category, {}).get(symbol)
            return dict(t) if t else None

    def orderbook(self, symbol: str, category: str = "USDT-FUTURES") -> dict | None:
        with self._lock:
            book = self._books.get(category, {}).get(symbol)
            if book is None:
                return None
            return book.levels()

    def trades(self, symbol: str, limit: int | None = None, category: str = "USDT-FUTURES") -> list[dict]:
        with self._lock:
            buf = self._trades.get(category, {}).get(symbol)
            if not buf:
                return []
            items = list(buf)
            return items[-limit:] if limit is not None else items

    def mark_prices(self, category: str | None = None) -> dict[str, dict]:
        with self._lock:
            if category is not None:
                return {k: dict(v) for k, v in self._mark.get(category, {}).items()}
            merged: dict[str, dict] = {}
            for cat, mirror in self._mark.items():
                for k, v in mirror.items():
                    row = dict(v)
                    row.setdefault("category", cat)
                    merged[f"{cat}:{k}"] = row
            return merged

    def funding(self, category: str | None = None) -> dict[str, dict]:
        with self._lock:
            if category is not None:
                return {k: dict(v) for k, v in self._funding.get(category, {}).items()}
            merged: dict[str, dict] = {}
            for cat, mirror in self._funding.items():
                for k, v in mirror.items():
                    row = dict(v)
                    row.setdefault("category", cat)
                    merged[f"{cat}:{k}"] = row
            return merged

    def instruments(self, category: str | None = None) -> dict[str, dict]:
        with self._lock:
            if category is not None:
                return {k: dict(v) for k, v in self._instruments.get(category, {}).items()}
            merged: dict[str, dict] = {}
            for cat, mirror in self._instruments.items():
                for k, v in mirror.items():
                    row = dict(v)
                    row.setdefault("category", cat)
                    merged[f"{cat}:{k}"] = row
            return merged

    def instrument(self, symbol: str, category: str = "USDT-FUTURES") -> dict | None:
        with self._lock:
            inst = self._instruments.get(category, {}).get(symbol)
            return dict(inst) if inst else None

    async def _refresh_instruments(self, category: str) -> None:
        try:
            rows = await asyncio.to_thread(self._fetch_instruments, category)
        except Exception as exc:  # noqa: BLE001
            logger.warning("MarketStream[%s] instruments refresh failed: %s", category, exc)
            return
        with self._lock:
            mirror: dict[str, dict] = {}
            for row in rows:
                norm = _normalize_instrument(row)
                if norm:
                    norm.setdefault("category", category)
                    mirror[norm["instId"]] = norm
            self._instruments[category] = mirror
        logger.info("MarketStream[%s] instruments cached: %d", category, len(mirror))

    async def _refresh_tickers(self, category: str) -> None:
        try:
            rows = await asyncio.to_thread(self._fetch_tickers, category)
        except Exception as exc:  # noqa: BLE001
            logger.warning("MarketStream[%s] tickers refresh failed: %s", category, exc)
            return
        with self._lock:
            for row in rows:
                norm = _normalize_ticker(row)
                if not norm:
                    continue
                norm.setdefault("category", category)
                self._tickers[category][norm["instId"]] = norm
        logger.info("MarketStream[%s] tickers seeded: %d", category, len(rows))
