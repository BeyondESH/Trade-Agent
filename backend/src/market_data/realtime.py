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
import json
import logging
import threading
from typing import Any

from websockets.asyncio.client import ClientConnection, connect

from market_data.ingestion import KlineIngestor

logger = logging.getLogger(__name__)

PING_FRAME = '{"event":"ping"}'
PONG_FRAME = '{"event":"pong"}'

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
        self._lock = threading.Lock()
        self._task: asyncio.Task | None = None
        self._stopping = False

    # -- channels ----------------------------------------------------------
    def _channels(self) -> list[dict[str, str]]:
        return [
            {"instType": self._category, "channel": f"candle{tf}", "instId": symbol}
            for symbol in self._symbols
            for tf in self._timeframes
        ]

    @staticmethod
    def _series_key(category: str, symbol: str, timeframe: str) -> str:
        return f"{category}/{symbol}/{timeframe}"

    # -- lifecycle ---------------------------------------------------------
    def start(self) -> None:
        if self._task is not None:
            return
        self._stopping = False
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        self._stopping = True
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
                    await self._subscribe(ws)
                    await self._read_loop(ws)
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
            except asyncio.TimeoutError:
                silent += 1
                if silent >= 2:
                    logger.warning("Bitget WS silent; forcing reconnect.")
                    raise ConnectionError("no messages within heartbeat window")
                await self._safe_send(ws, PING_FRAME)
                continue
            silent = 0
            await self._handle_frame(ws, raw)

    async def _safe_send(self, ws: ClientConnection, text: str) -> None:
        try:
            await ws.send(text)
        except Exception:  # noqa: BLE001 - surfaced by the read loop on the next recv
            pass

    # -- frame handling ----------------------------------------------------
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
                logger.warning("Bitget WS error frame: %s", msg)
            return
        action = msg.get("action")
        if action not in ("snapshot", "update"):
            return
        arg = msg.get("arg") or {}
        inst_type = arg.get("instType")
        inst_id = arg.get("instId")
        channel = arg.get("channel") or ""
        timeframe = channel[6:] if channel.startswith("candle") else ""
        if not (inst_type and inst_id and timeframe):
            return
        rows = msg.get("data") or []
        key = self._series_key(inst_type, inst_id, timeframe)
        with self._lock:
            bars = self._buffer.setdefault(key, [])
            for row in rows:
                self._upsert(bars, KlineIngestor._coerce_row(row))

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
