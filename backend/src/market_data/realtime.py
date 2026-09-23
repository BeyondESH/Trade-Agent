"""Bitget public WebSocket stream for real-time klines (no auth required).

Subscribes to `candle{interval}` channels for the configured symbols and
timeframes, keeps the last bar per series in an in-memory buffer, and
auto-reconnects with resubscribe on failure.

Usage (from the running event loop, e.g. FastAPI lifespan):
    stream = BitgetWsStream(...)
    stream.start()
    bar = stream.latest(category, symbol, timeframe)
    await stream.stop()
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
import threading
from collections.abc import Callable
from typing import Any

from websockets.asyncio.client import ClientConnection, connect

from market_data.ingestion import KlineIngestor
from market_data.models import granularity_to_timeframe, timeframe_to_granularity

logger = logging.getLogger(__name__)

PING_FRAME = "ping"
PONG_FRAME = "pong"

MAX_BARS_PER_SERIES = 200


class BitgetWsStream:
    def __init__(
        self,
        *,
        url: str,
        category: str,
        symbols: list[str],
        timeframes: list[str],
        heartbeat_seconds: float = 30.0,
        reconnect_seconds: float = 5.0,
    ) -> None:
        self._url = url
        self._category = category
        self._symbols = list(symbols)
        self._timeframes = list(timeframes)
        self._heartbeat = heartbeat_seconds
        self._reconnect = reconnect_seconds
        self._buffer: dict[str, list[dict[str, Any]]] = {}
        # Extra (category, symbol, timeframe) subscriptions added at runtime,
        # refcounted so multiple clients sharing a series keep it alive.
        self._extra: dict[tuple[str, str, str], int] = {}
        # Listeners notified when a series' latest bar changes. Keyed by the
        # same (category, symbol, timeframe) triple as _extra.
        self._listeners: dict[tuple[str, str, str], set[Callable[[dict[str, Any]], None]]] = {}
        self._lock = threading.Lock()
        self._task: asyncio.Task | None = None
        # The event loop that owns this stream, captured at `start()`. Needed
        # because `subscribe`/`unsubscribe` are legitimately called from worker
        # threads (FastAPI runs sync endpoints in a threadpool), where there is
        # no running loop to attach a task to.
        self._loop: asyncio.AbstractEventLoop | None = None
        # Strong references to in-flight subscription-op sends. asyncio only
        # keeps weak references to tasks, and an unreferenced task can vanish
        # before it ever runs — silently dropping a subscribe/unsubscribe and
        # freezing the series until the next reconnect.
        self._op_tasks: set[asyncio.Task] = set()
        self._op_futures: set[concurrent.futures.Future] = set()
        self._stopping = False
        self._ws: ClientConnection | None = None

    # -- channels ----------------------------------------------------------
    def _channels(self) -> list[dict[str, str]]:
        channels = [
            {
                "instType": self._category,
                "channel": f"candle{timeframe_to_granularity(tf)}",
                "instId": symbol,
            }
            for symbol in self._symbols
            for tf in self._timeframes
        ]
        with self._lock:
            for category, symbol, timeframe in self._extra:
                channels.append(
                    {
                        "instType": category,
                        "channel": f"candle{timeframe_to_granularity(timeframe)}",
                        "instId": symbol,
                    }
                )
        return channels

    @staticmethod
    def _series_key(category: str, symbol: str, timeframe: str) -> str:
        return f"{category}/{symbol}/{timeframe}"

    # -- dynamic subscriptions ---------------------------------------------
    def subscribe(self, category: str, symbol: str, timeframe: str) -> None:
        """Add a live candle subscription for a series (refcounted).

        Safe to call from any thread; if the socket is already open the
        subscription frame is sent immediately, otherwise it is picked up on
        the next (re)connect because `_channels()` merges extra series.
        """
        key = (category, symbol, timeframe)
        with self._lock:
            if key in self._extra:
                self._extra[key] += 1
                return
            self._extra[key] = 1
        self._request("subscribe", category, symbol, timeframe)

    def unsubscribe(self, category: str, symbol: str, timeframe: str) -> None:
        """Release one ref on a series; at zero, unsubscribes from the feed."""
        key = (category, symbol, timeframe)
        with self._lock:
            remaining = self._extra.get(key, 0) - 1
            if remaining > 0:
                self._extra[key] = remaining
                return
            self._extra.pop(key, None)
        self._request("unsubscribe", category, symbol, timeframe)
        with self._lock:
            self._buffer.pop(self._series_key(category, symbol, timeframe), None)

    def add_listener(
        self, category: str, symbol: str, timeframe: str, callback: Callable[[dict[str, Any]], None]
    ) -> None:
        """Register a callback invoked with the latest bar when a series changes.

        The callback is called with a copy of the series' most recent bar after
        every Bitget candle update frame that touches the series. Safe to call
        from any thread.
        """
        key = (category, symbol, timeframe)
        with self._lock:
            self._listeners.setdefault(key, set()).add(callback)

    def remove_listener(
        self, category: str, symbol: str, timeframe: str, callback: Callable[[dict[str, Any]], None]
    ) -> None:
        """Unregister a listener; idempotent."""
        key = (category, symbol, timeframe)
        with self._lock:
            callbacks = self._listeners.get(key)
            if callbacks is None:
                return
            callbacks.discard(callback)
            if not callbacks:
                self._listeners.pop(key, None)

    def _notify(self, category: str, symbol: str, timeframe: str, bar: dict[str, Any]) -> None:
        """Fan the latest bar out to the series' listeners (copy to avoid
        mutating the set while callbacks run)."""
        key = (category, symbol, timeframe)
        with self._lock:
            callbacks = list(self._listeners.get(key, ()))
        for cb in callbacks:
            try:
                cb(dict(bar))
            except Exception:  # noqa: BLE001 - a broken listener must not break the stream
                logger.exception("candle listener failed for %s", self._series_key(*key))

    def _request(self, op: str, category: str, symbol: str, timeframe: str) -> None:
        payload = json.dumps(
            {
                "op": op,
                "args": [
                    {
                        "instType": category,
                        "channel": f"candle{timeframe_to_granularity(timeframe)}",
                        "instId": symbol,
                    }
                ],
            }
        )
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        target = running if running is not None else self._loop
        if target is None or target.is_closed():
            # No loop yet (before start()); the op is still registered in
            # `_extra` and `_channels()` applies it on (re)connect.
            logger.debug(
                "candle %s %s/%s/%s: no loop yet; applied on connect",
                op,
                category,
                symbol,
                timeframe,
            )
            return
        if running is not None:
            task = target.create_task(self._send_op(op, payload))
            # Keep a strong reference until completion: asyncio holds only a
            # weak reference and an unreferenced task may be collected before
            # it runs, which would silently drop the op.
            self._op_tasks.add(task)
            task.add_done_callback(self._op_tasks.discard)
        else:
            # Called from a worker thread (sync FastAPI endpoint): hand the op
            # to the stream's loop so it actually reaches the feed.
            fut = asyncio.run_coroutine_threadsafe(self._send_op(op, payload), target)
            self._op_futures.add(fut)
            fut.add_done_callback(self._op_futures.discard)

    async def _send_op(self, op: str, payload: str, timeout: float = 5.0) -> None:
        """Send one subscription op with a bound and real failure handling.

        Historically this was fire-and-forget and silent: a dropped op left the
        refcount claiming the series was subscribed while the feed never
        received it, freezing live updates until the next reconnect. On any
        failure, close the upstream socket so the reconnect path re-issues all
        subscriptions from `_channels()`.
        """
        ws = self._ws
        if ws is None:
            logger.warning("candle %s: feed not connected; re-applied on reconnect", op)
            return
        try:
            await asyncio.wait_for(ws.send(payload), timeout)
        except Exception as exc:  # noqa: BLE001 - recover by cycling the feed
            logger.warning("candle %s send failed (%r); forcing feed reconnect", op, exc)
            try:
                await asyncio.wait_for(ws.close(), timeout)
            except Exception:  # noqa: BLE001 - heartbeat path still heals
                logger.warning("candle %s: feed close timed out; awaiting heartbeat", op)

    # -- lifecycle ---------------------------------------------------------
    def start(self) -> None:
        if self._task is not None:
            return
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            self._loop = None
        self._stopping = False
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        self._stopping = True
        for t in list(self._op_tasks):
            t.cancel()
        for f in list(self._op_futures):
            f.cancel()
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    def latest(self, category: str, symbol: str, timeframe: str) -> dict | None:
        key = self._series_key(category, symbol, timeframe)
        with self._lock:
            bars = self._buffer.get(key)
            return dict(bars[-1]) if bars else None

    def recent(
        self,
        category: str,
        symbol: str,
        timeframe: str,
        limit: int | None = None,
    ) -> list[dict]:
        key = self._series_key(category, symbol, timeframe)
        with self._lock:
            bars = self._buffer.get(key) or []
            if limit is not None:
                bars = bars[-limit:]
            return [dict(b) for b in bars]

    # -- connection loop ---------------------------------------------------
    async def _run_loop(self) -> None:
        while not self._stopping:
            try:
                async with connect(self._url, open_timeout=10) as ws:
                    logger.info("Bitget WS connected: %s", self._url)
                    self._ws = ws
                    try:
                        await self._subscribe(ws)
                        await self._read_loop(ws)
                    finally:
                        if self._ws is ws:
                            self._ws = None
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                logger.warning("Bitget WS connection failed: %s", exc)
            if not self._stopping:
                await asyncio.sleep(self._reconnect)

    async def _subscribe(self, ws: ClientConnection) -> None:
        channels = self._channels()
        # chunk to stay well under the ~4096-byte per-message limit
        chunk: list[dict[str, str]] = []
        for ch in channels:
            chunk.append(ch)
            if len(json.dumps({"op": "subscribe", "args": chunk})) >= 3000:
                await ws.send(json.dumps({"op": "subscribe", "args": chunk}))
                chunk = []
        if chunk:
            await ws.send(json.dumps({"op": "subscribe", "args": chunk}))
        logger.info("Subscribed %d candle channels.", len(channels))

    async def _read_loop(self, ws: ClientConnection) -> None:
        silent = 0
        while True:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=self._heartbeat)
            except TimeoutError:
                silent += 1
                if silent >= 2:
                    logger.warning("Bitget WS silent; forcing reconnect.")
                    raise ConnectionError("no messages within heartbeat window") from None
                await self._safe_send(ws, PING_FRAME)
                continue
            silent = 0
            await self._handle_frame(ws, raw)

    async def _safe_send(self, ws: ClientConnection | None, text: str) -> None:
        if ws is None:
            return
        try:
            await ws.send(text)
        except Exception:  # noqa: BLE001 - surfaced by the read loop on the next recv
            pass

    # -- frame handling ----------------------------------------------------
    async def _handle_frame(self, ws: ClientConnection, raw: Any) -> None:
        # Bitget heartbeats are plain strings "ping"/"pong"; handle before JSON.
        if isinstance(raw, (bytes, str)):
            text = raw.decode() if isinstance(raw, bytes) else raw
            stripped = text.strip()
            if stripped == "ping":
                await self._safe_send(ws, PONG_FRAME)
                return
            if stripped == "pong":
                return
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
                logger.warning("Bitget WS error frame: %s", msg)
            return
        action = msg.get("action")
        if action not in ("snapshot", "update"):
            return
        arg = msg.get("arg") or {}
        inst_type = arg.get("instType")
        inst_id = arg.get("instId")
        channel = arg.get("channel") or ""
        # Reverse-map the WS channel token back to a stable internal timeframe
        # key. Token-driven (not blind lowercasing) so the month channel
        # `candle1M` resolves to `1mo` rather than collapsing onto the minute
        # series `1m`.
        if not channel.startswith("candle"):
            return
        try:
            timeframe = granularity_to_timeframe(channel[len("candle") :])
        except ValueError:
            return
        if not (inst_type and inst_id):
            return
        rows = msg.get("data") or []
        key = self._series_key(inst_type, inst_id, timeframe)
        with self._lock:
            bars = self._buffer.setdefault(key, [])
            before = dict(bars[-1]) if bars else None
            for row in rows:
                self._upsert(bars, KlineIngestor._coerce_row(row))
            changed = (bars[-1] if bars else None) != before
            latest = dict(bars[-1]) if bars else None
        if changed and latest is not None:
            self._notify(inst_type, inst_id, timeframe, latest)

    @staticmethod
    def _upsert(bars: list[dict[str, Any]], bar: dict[str, Any]) -> None:
        """Insert or replace a bar keeping the list sorted by open_time (asc)."""
        ts = bar["open_time"]
        i = len(bars) - 1
        while i >= 0:
            cur = bars[i]
            if cur["open_time"] == ts:
                bars[i] = bar
                return
            if cur["open_time"] < ts:
                bars.insert(i + 1, bar)
                break
            i -= 1
        else:
            bars.insert(0, bar)
        if len(bars) > MAX_BARS_PER_SERIES:
            del bars[: len(bars) - MAX_BARS_PER_SERIES]
