"""Dedicated background thread that polls AKShare news and pushes to SSE.

AKShare calls are synchronous and slow (2-6s per source), so they must never
run on the event loop. A single daemon `threading.Thread` owns the polling
loop and publishes new items into per-subscriber `asyncio.Queue` objects via
`loop.call_soon_threadsafe` (the same bridge pattern used by `mcp_client.py`).

The thread keeps a ring buffer (deque) of recent items so a newly connected
SSE subscriber gets an immediate `snapshot` replay. There is intentionally no
cross-source content dedup (overlapping wire stories are shown as-is); item
ids are content-stable so the frontend can dedup replays by id instead.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from collections import deque
from collections.abc import Callable
from typing import Any

from market_data import newsfeed
from market_data.config import get_settings

logger = logging.getLogger(__name__)

# Heartbeat comment frame interval for SSE connections (keeps proxies from
# dropping idle long-poll connections).
HEARTBEAT_SECONDS = 15.0

# Cap on the per-source backoff multiplier (x poll interval).
MAX_BACKOFF_MULTIPLIER = 5

# Max items replayed in one SSE `snapshot` frame (bounds reconnect payloads).
SNAPSHOT_MAX_ITEMS = 100


def sse_frame(event: str, data: Any) -> str:
    """Serialize one SSE frame: `event:` + `data:` lines, blank-line terminated."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


class NewsBroker:
    """Polls news sources in a worker thread and pushes items to subscribers."""

    def __init__(
        self,
        *,
        poll_seconds: int | None = None,
        buffer_size: int | None = None,
        fetcher: Callable[[str], list[dict]] | None = None,
    ) -> None:
        settings = get_settings()
        self._poll = float(poll_seconds if poll_seconds is not None else settings.news_poll_seconds)
        self._buffer: deque[dict] = deque(
            maxlen=buffer_size if buffer_size is not None else settings.news_buffer_size
        )
        self._fetcher = fetcher or self._default_fetcher
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._stopping = threading.Event()
        self._subscribers: set[asyncio.Queue] = set()
        self._sub_lock = threading.Lock()
        # source -> {last_ts, last_error, failures}
        self._health: dict[str, dict[str, Any]] = {}
        self._last_poll_ts: float | None = None
        self._ak: Any = None

    # -- lifecycle ---------------------------------------------------------
    def start(self) -> None:
        """Start the polling thread (no-op if already running)."""
        with self._lock:
            if self._thread is not None:
                return
            self._stopping.clear()
            self._thread = threading.Thread(target=self._run, name="news-poller", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        """Stop the polling thread and wake any waiting subscribers."""
        with self._lock:
            if self._thread is None:
                return
            self._stopping.set()
            self._thread.join(timeout=10)
            self._thread = None
        with self._sub_lock:
            for queue in list(self._subscribers):
                self._wake(queue)
            self._subscribers.clear()

    def _default_fetcher(self, source: str) -> list[dict]:
        if self._ak is None:
            self._ak = newsfeed.import_akshare()
        return newsfeed.fetch_source(source, self._ak)

    def _run(self) -> None:
        skip_until: dict[str, float] = {}
        while not self._stopping.is_set():
            try:
                self.poll_once(skip_until)
            except Exception as exc:  # noqa: BLE001 - the worker thread never dies
                logger.warning("news poll cycle failed: %s", exc)
                if isinstance(exc, ModuleNotFoundError):
                    logger.error("akshare not installed; news polling disabled")
                    return
            self._stopping.wait(timeout=self._poll)

    # -- polling -----------------------------------------------------------
    def poll_once(self, skip_until: dict[str, float] | None = None) -> None:
        """Run one poll cycle. Safe to call directly (tests inject a fetcher)."""
        skip = skip_until if skip_until is not None else {}
        now = time.time()
        new_items: list[dict] = []
        for source in newsfeed.SOURCES:
            health = self._health.setdefault(source, {"last_ts": None, "last_error": None, "failures": 0})
            if now < skip.get(source, 0.0):
                continue
            try:
                rows = self._fetcher(source)
            except Exception as exc:  # noqa: BLE001 - per-source isolation
                health["failures"] += 1
                health["last_error"] = str(exc)
                multiplier = min(2 ** (health["failures"] - 1), MAX_BACKOFF_MULTIPLIER)
                skip[source] = now + self._poll * multiplier
                logger.warning("news source %s failed (%d): %s", source, health["failures"], exc)
                continue
            health["failures"] = 0
            health["last_error"] = None
            health["last_ts"] = now
            new_items.extend(rows)
        self._last_poll_ts = now
        if new_items:
            with self._lock:
                for item in new_items:
                    self._buffer.append(item)
            self._publish(new_items)

    # -- publish / subscribe ----------------------------------------------
    def subscribe(self, queue: asyncio.Queue) -> None:
        """Register a subscriber queue (called from the event loop)."""
        with self._sub_lock:
            self._subscribers.add(queue)
            if self._loop is None:
                try:
                    self._loop = asyncio.get_running_loop()
                except RuntimeError:
                    pass

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        with self._sub_lock:
            self._subscribers.discard(queue)

    def _wake(self, queue: asyncio.Queue) -> None:
        """Schedule a sentinel on `queue` via the captured event loop."""
        loop = self._loop
        if loop is None:
            return
        try:
            loop.call_soon_threadsafe(queue.put_nowait, None)
        except RuntimeError:
            pass

    def _publish(self, items: list[dict]) -> None:
        loop = self._loop
        if loop is None:
            return
        with self._sub_lock:
            subscribers = list(self._subscribers)
        for queue in subscribers:
            try:
                for item in items:
                    loop.call_soon_threadsafe(queue.put_nowait, item)
            except RuntimeError:
                pass  # loop closed; the subscriber cleans up on disconnect

    # -- queries -----------------------------------------------------------
    def recent(self, hours: int | None = None, categories: str | None = None) -> list[dict]:
        """Return buffered items, optionally filtered by age and categories."""
        cutoff = None if hours is None else time.time() - hours * 3600
        cats = {c.strip() for c in categories.split(",") if c.strip()} if categories else None
        with self._lock:
            items = list(self._buffer)
        if cutoff is not None:
            items = [item for item in items if item["ts"] >= cutoff]
        if cats:
            items = [item for item in items if item["category"] in cats]
        return items

    def snapshot(self, max_items: int = SNAPSHOT_MAX_ITEMS) -> tuple[list[dict], int]:
        """Newest-first snapshot for SSE replay, capped at `max_items`.

        Sorted by ``ts`` descending (sources may return newest-first already,
        so insertion order is not chronological). Returns ``(items, total)`` so
        the client knows when the ring has more history to page.
        """
        with self._lock:
            items = sorted(self._buffer, key=lambda i: i["ts"], reverse=True)
        return items[:max_items], len(items)

    def page(self, offset: int = 0, limit: int = 100, categories: str | None = None) -> tuple[list[dict], int]:
        """Page the ring buffer newest-first; returns ``(items, total)``."""
        cats = {c.strip() for c in categories.split(",") if c.strip()} if categories else None
        with self._lock:
            items = sorted(self._buffer, key=lambda i: i["ts"], reverse=True)
        if cats:
            items = [item for item in items if item["category"] in cats]
        return items[offset : offset + limit], len(items)

    @property
    def categories(self) -> list[str]:
        return [category for category, _ in newsfeed.CATEGORY_RULES]

    def health(self) -> dict:
        with self._lock:
            return {
                "poll_seconds": self._poll,
                "buffer_size": self._buffer.maxlen,
                "buffer_items": len(self._buffer),
                "last_poll": self._last_poll_ts,
                "running": self._thread is not None,
                "sources": {source: dict(health) for source, health in self._health.items()},
            }
