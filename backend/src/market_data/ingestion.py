"""K-line ingestion via MCP / Bitget v2 REST (tasks 3.1-3.4)."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx
import pandas as pd

from market_data.mcp_client import McpDataClient, McpError
from market_data.models import (
    OHLCV_COLUMNS,
    Series,
    is_realtime_only_timeframe,
    timeframe_step_ms,
    timeframe_to_granularity,
)
from market_data.store import ParquetStore

logger = logging.getLogger(__name__)

# Tool + action names for the Bitget MCP intent surface (confirmed via discover.py).
# `market` verb; `candlesHistory` returns historical klines for a [startTime,endTime]
# range at the given `interval`.
MARKET_TOOL = "market"
CANDLES_ACTION = "candlesHistory"

# Public v2 REST candle endpoints (no auth). The MCP `history-candles` bridge
# only serves the last 90 days; these endpoints paginate back to the exchange's
# true history start, so deep backfill uses them directly.
V2_MIX_CANDLES_URL = "https://api.bitget.com/api/v2/mix/market/candles"
V2_SPOT_CANDLES_URL = "https://api.bitget.com/api/v2/spot/market/candles"

# Public v3 REST history-candles endpoint (no auth). Unlike the v2 `candles`
# endpoints (which cap intraday history at ~30-150 days) this endpoint serves
# the exchange's full history for every granularity, bounded to 100 rows and
# 90 calendar days per request.
V3_HISTORY_CANDLES_URL = "https://api.bitget.com/api/v3/market/history-candles"


class V2RestError(RuntimeError):
    """Raised when a Bitget v2 REST candles request fails persistently."""


class KlineIngestor:
    def __init__(
        self,
        client: McpDataClient | None = None,
        store: ParquetStore | None = None,
        *,
        page_limit: int = 1000,
    ) -> None:
        self._client = client
        self._store = store
        self._page_limit = page_limit

    # -- 3.1 / 3.2: fetch a full range with backward pagination -----------
    def fetch_range(
        self,
        series: Series,
        start_ms: int,
        end_ms: int,
    ) -> pd.DataFrame:
        # Realtime-only levels (e.g. `1s`) have no REST history and no step.
        if is_realtime_only_timeframe(series.timeframe):
            return pd.DataFrame(columns=OHLCV_COLUMNS)
        step = timeframe_step_ms(series.timeframe)
        interval = timeframe_to_granularity(series.timeframe)
        # `candlesHistory` returns up to `limit` candles ending at `endTime`,
        # walking backwards. Page from end_ms towards start_ms.
        cursor_end = end_ms
        pages: list[pd.DataFrame] = []

        while cursor_end >= start_ms:
            payload = self._client.call_tool(
                MARKET_TOOL,
                {
                    "action": CANDLES_ACTION,
                    "category": series.category,
                    "symbol": series.symbol,
                    "interval": interval,
                    "endTime": str(cursor_end),
                    "limit": str(self._page_limit),
                },
            )
            page = self._normalize_payload(payload)
            page = page[page["open_time"] <= cursor_end]
            if page.empty:
                break
            pages.append(page)
            page_min = int(page["open_time"].min())
            if page_min <= start_ms or len(page) < self._page_limit:
                break
            next_end = page_min - step
            if next_end >= cursor_end:  # no backward progress -> stop
                break
            cursor_end = next_end

        if not pages:
            return pd.DataFrame(columns=OHLCV_COLUMNS)
        combined = pd.concat(pages, ignore_index=True)
        combined = combined[
            (combined["open_time"] >= start_ms) & (combined["open_time"] <= end_ms)
        ]
        return (
            combined.drop_duplicates(subset="open_time")
            .sort_values("open_time")
            .reset_index(drop=True)
        )

    # -- 3.3: incremental (only fill the gap) -----------------------------
    def ingest_incremental(
        self,
        series: Series,
        start_ms: int,
        end_ms: int,
    ) -> int:
        latest = self._store.latest_open_time(series)
        if latest is not None and latest >= start_ms:
            start_ms = latest + timeframe_step_ms(series.timeframe)
        if start_ms > end_ms:
            logger.info("%s already up to date.", series.relative_path())
            return 0
        frame = self.fetch_range(series, start_ms, end_ms)
        return self._store.save(series, frame)

    # -- 3.4: gap detection -----------------------------------------------
    def find_gaps(self, series: Series) -> list[int]:
        """Return open_time values that are missing between min and max."""
        if is_realtime_only_timeframe(series.timeframe):
            return []
        frame = self._store.read(series)
        if len(frame) < 2:
            return []
        step = timeframe_step_ms(series.timeframe)
        present = set(frame["open_time"].astype("int64").tolist())
        expected = range(int(frame["open_time"].min()), int(frame["open_time"].max()) + step, step)
        missing = [t for t in expected if t not in present]
        if missing:
            logger.warning("%s has %d missing bars.", series.relative_path(), len(missing))
        return missing

    # -- deep backfill: paginate towards the earliest available history ----
    _RATE_LIMIT_HINTS = ("rate", "limit", "frequen", "too many")

    def backfill_before(
        self,
        series: Series,
        before_ms: int,
        *,
        max_pages: int = 3,
        max_retries: int = 3,
        backoff_base: float = 0.5,
        sleep: Callable[[float], None] | None = None,
    ) -> tuple[int, bool]:
        """Fetch history strictly before `before_ms`, walking backwards.

        Each page is merged into the store immediately so progress survives
        rate-limit retries. Returns (rows_appended, earliest_reached) where
        `earliest_reached` means the exchange has no older history.
        """
        pause = sleep if sleep is not None else time.sleep
        # Realtime-only levels (e.g. `1s`) have no history to backfill.
        if is_realtime_only_timeframe(series.timeframe):
            return 0, True
        step = timeframe_step_ms(series.timeframe)
        interval = timeframe_to_granularity(series.timeframe)
        # `cursor_end` is an exclusive upper bound; the first page may still
        # contain already-stored rows (the store dedupes on save).
        cursor_end = before_ms
        appended = 0

        for _page in range(max(1, max_pages)):
            payload = self._call_with_backoff(
                series, interval, cursor_end, max_retries, backoff_base, pause
            )
            page = self._normalize_payload(payload)
            page = page[(page["open_time"] < cursor_end) & (page["open_time"] >= 0)]
            if page.empty:
                return appended, True
            appended += self._store.save(series, page)
            page_min = int(page["open_time"].min())
            if len(page) < self._page_limit:
                return appended, True
            next_end = page_min - step
            if next_end >= cursor_end or next_end < 0:
                return appended, True
            cursor_end = next_end
        return appended, False

    # -- deep backfill via Bitget v3 REST (full history, no depth cap) --------
    def backfill_before_rest(
        self,
        series: Series,
        before_ms: int,
        *,
        fetch_page: Callable[[str, str, str, int, int], list[Any]] | None = None,
        max_pages: int = 10,
        max_retries: int = 3,
        backoff_base: float = 0.5,
        page_delay: float = 0.0,
        sleep: Callable[[float], None] | None = None,
        parallel: bool = False,
        page_limit: int | None = None,
    ) -> tuple[int, bool]:
        """Fetch history strictly before `before_ms` via the public Bitget v3
        history-candles endpoint, paginating backwards and merging each page
        into the store immediately.

        The v3 endpoint serves the exchange's full history (no near-window
        depth cap) for every granularity, bounded to 100 rows and at most 90
        calendar days per request. Unlike the v2 `candles` endpoints, a page
        shorter than the limit is NOT a history-end signal for low timeframes;
        we walk the cursor back by the oldest row of each page and only treat
        a (retried) empty page as having reached the exchange's true earliest
        data.

        With `parallel=True` the page cursor chain is pre-computed from the
        granularity (window = min(90 days, page_limit * step)) and fetched
        concurrently, then merged (dedup + sort) in one store write.

        Returns (rows_appended, earliest_reached).
        """
        assert self._store is not None
        pause = sleep if sleep is not None else time.sleep
        fetcher = fetch_page if fetch_page is not None else self._fetch_v3_history_page
        step = timeframe_step_ms(series.timeframe)
        granularity = timeframe_to_granularity(series.timeframe)
        page_limit = min(self._page_limit if page_limit is None else page_limit, 100)
        # Rows at or after the store's current earliest are already persisted;
        # a backward backfill only ever adds rows strictly before it. Slicing
        # on this bound avoids re-reading/rewriting already-stored day files.
        earliest = self._store.earliest_open_time(series)

        if parallel:
            return self._backfill_before_rest_parallel(
                series, before_ms, fetcher, granularity, page_limit,
                max_pages, max_retries, backoff_base, pause, step, earliest,
            )

        cursor_end = before_ms
        appended = 0
        # The first page is strictly bounded by `before_ms` (that bar is already
        # stored); later pages may include the bar exactly at `cursor_end` (one
        # step before the previous page's oldest bar) to keep history gapless.
        strict = True

        for _page in range(max(1, max_pages)):
            page = self._fetch_v2_page_normalized(
                fetcher, series, granularity, cursor_end, page_limit,
                strict, max_retries, backoff_base, pause,
            )
            if page.empty:
                # Retry the same cursor once (transient empty / boundary) before
                # concluding the exchange has no older data.
                pause(min(backoff_base, 0.2))
                page = self._fetch_v2_page_normalized(
                    fetcher, series, granularity, cursor_end, page_limit,
                    strict, max_retries, backoff_base, pause,
                )
                if page.empty:
                    return appended, True
            page_min = int(page["open_time"].min())
            # Only rows strictly before the store's earliest are new; advance the
            # cursor from the raw page so already-stored windows don't stall it.
            new_rows = page[page["open_time"] < earliest] if earliest is not None else page
            if not new_rows.empty:
                appended += self._store.save(series, new_rows)
            next_end = page_min - step
            if next_end >= cursor_end or next_end < 0:
                return appended, True
            cursor_end = next_end
            strict = False
            if page_delay > 0:
                pause(page_delay)
        return appended, False

    def _backfill_before_rest_parallel(
        self,
        series: Series,
        before_ms: int,
        fetcher: Callable[[str, str, str, int, int], list[Any]],
        granularity: str,
        page_limit: int,
        max_pages: int,
        max_retries: int,
        backoff_base: float,
        pause: Callable[[float], None],
        step: int,
        earliest: int | None,
    ) -> tuple[int, bool]:
        """Concurrent page fetch with a pre-computed, disjoint cursor chain.

        The v3 endpoint returns at most 100 rows (or the 90 calendar days
        before `endTime` for low timeframes) per request. Cursors spaced by
        `min(90 days, page_limit * step)` partition the timeline; sparse data
        may produce overlap between adjacent windows, which the merge dedupes.
        """
        window = min(90 * 86_400_000, page_limit * step)
        cursors = [before_ms - i * window for i in range(max(1, max_pages))]

        def fetch_one(cursor_end: int) -> tuple[int, pd.DataFrame]:
            strict = cursor_end == cursors[0]
            page = self._fetch_v2_page_normalized(
                fetcher, series, granularity, cursor_end, page_limit,
                strict, max_retries, backoff_base, pause,
            )
            return cursor_end, page

        with ThreadPoolExecutor(max_workers=min(8, max(1, max_pages))) as pool:
            results = list(pool.map(fetch_one, cursors))

        # Retry any empty page once (transient) before concluding no data.
        empties = [c for c, f in results if f.empty]
        if empties:
            pause(min(backoff_base, 0.2))
            with ThreadPoolExecutor(max_workers=min(8, max(1, len(empties)))) as pool:
                retried = {c: f for c, f in pool.map(fetch_one, empties)}
            results = [(c, retried.get(c, f) if f.empty else f) for c, f in results]

        frames = [f for _, f in results if not f.empty]
        if not frames:
            return 0, True
        oldest_cursor = min(c for c, _ in results)
        oldest_empty = next(f.empty for c, f in results if c == oldest_cursor)
        merged = (
            pd.concat(frames, ignore_index=True)
            .drop_duplicates(subset="open_time")
            .sort_values("open_time")
            .reset_index(drop=True)
        )
        if earliest is not None:
            merged = merged[merged["open_time"] < earliest]
        if merged.empty:
            return 0, oldest_empty
        appended = self._store.save(series, merged)
        return appended, oldest_empty

    def _fetch_v2_page_normalized(
        self,
        fetcher: Callable[[str, str, str, int, int], list[Any]],
        series: Series,
        granularity: str,
        cursor_end: int,
        page_limit: int,
        strict: bool,
        max_retries: int,
        backoff_base: float,
        pause: Callable[[float], None],
    ) -> pd.DataFrame:
        rows = self._call_v2_with_backoff(
            fetcher, series, granularity, cursor_end, page_limit,
            max_retries, backoff_base, pause,
        )
        page = self._normalize_payload({"data": rows})
        if strict:
            page = page[(page["open_time"] < cursor_end) & (page["open_time"] >= 0)]
        else:
            page = page[(page["open_time"] <= cursor_end) & (page["open_time"] >= 0)]
        if page.empty:
            return page
        return (
            page.drop_duplicates(subset="open_time")
            .sort_values("open_time")
            .reset_index(drop=True)
        )

    def _call_v2_with_backoff(
        self,
        fetcher: Callable[[str, str, str, int, int], list[Any]],
        series: Series,
        granularity: str,
        cursor_end: int,
        page_limit: int,
        max_retries: int,
        backoff_base: float,
        pause: Callable[[float], None],
    ) -> list[Any]:
        last_exc: Exception | None = None
        for attempt in range(max(1, max_retries)):
            try:
                return fetcher(series.category, series.symbol, granularity, cursor_end, page_limit)
            except V2RestError as exc:
                last_exc = exc
                if not self._is_rate_limited(exc):
                    raise
                logger.warning(
                    "v2 REST rate limited fetching %s (%s); retry %d/%d.",
                    series.relative_path(), granularity, attempt + 1, max_retries,
                )
                if attempt < max_retries - 1:
                    pause(backoff_base * (attempt + 1))
        assert last_exc is not None
        raise last_exc

    @staticmethod
    def _fetch_v2_page(
        category: str,
        symbol: str,
        granularity: str,
        end_ms: int,
        limit: int,
    ) -> list[Any]:
        """Query one page of candles from the public Bitget v2 REST endpoint.

        Returns raw descending rows; the caller normalizes them.
        """
        product_type = category if "FUTURES" in category else None
        params: dict[str, Any] = {
            "symbol": symbol,
            "granularity": granularity,
            "endTime": str(end_ms),
            "limit": str(min(limit, 1000)),
        }
        url = V2_MIX_CANDLES_URL
        if product_type:
            params["productType"] = product_type
        else:
            url = V2_SPOT_CANDLES_URL
        try:
            resp = httpx.get(url, params=params, timeout=10.0)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response is not None and exc.response.status_code == 429:
                raise V2RestError("rate limit: HTTP 429") from exc
            raise V2RestError(f"v2 candles http error: {exc}") from exc
        body = resp.json()
        code = str(body.get("code"))
        msg = str(body.get("msg") or body.get("message") or "")
        if code not in ("00000", "0"):
            if "429" in code or any(hint in msg.lower() for hint in KlineIngestor._RATE_LIMIT_HINTS):
                raise V2RestError(f"rate limit: {code} {msg}")
            raise V2RestError(f"v2 candles error {code}: {msg}")
        return body.get("data") or []

    @staticmethod
    def _fetch_v3_history_page(
        category: str,
        symbol: str,
        granularity: str,
        end_ms: int,
        limit: int,
    ) -> list[Any]:
        """Query one page of history candles from the public Bitget v3 endpoint.

        The v3 `history-candles` endpoint serves the exchange's full history
        (no near-window depth cap) for every granularity, but returns at most
        100 rows spanning at most 90 calendar days per request. Returns raw
        ascending rows; the caller normalizes them.
        """
        params: dict[str, Any] = {
            "category": category,
            "symbol": symbol,
            "interval": granularity,
            "endTime": str(end_ms),
            "limit": str(min(limit, 100)),
        }
        try:
            resp = httpx.get(V3_HISTORY_CANDLES_URL, params=params, timeout=10.0)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response is not None and exc.response.status_code == 429:
                raise V2RestError("rate limit: HTTP 429") from exc
            raise V2RestError(f"v3 history-candles http error: {exc}") from exc
        body = resp.json()
        code = str(body.get("code"))
        msg = str(body.get("msg") or body.get("message") or "")
        if code not in ("00000", "0"):
            if "429" in code or any(hint in msg.lower() for hint in KlineIngestor._RATE_LIMIT_HINTS):
                raise V2RestError(f"rate limit: {code} {msg}")
            raise V2RestError(f"v3 history-candles error {code}: {msg}")
        return body.get("data") or []

    def _call_with_backoff(
        self,
        series: Series,
        interval: str,
        cursor_end: int,
        max_retries: int,
        backoff_base: float,
        pause: Callable[[float], None],
    ) -> Any:
        last_exc: McpError | None = None
        for attempt in range(max(1, max_retries)):
            try:
                return self._client.call_tool(
                    MARKET_TOOL,
                    {
                        "action": CANDLES_ACTION,
                        "category": series.category,
                        "symbol": series.symbol,
                        "interval": interval,
                        "endTime": str(cursor_end),
                        "limit": str(self._page_limit),
                    },
                )
            except McpError as exc:
                last_exc = exc
                if not self._is_rate_limited(exc):
                    raise
                logger.warning(
                    "Rate limited fetching %s (%s); retry %d/%d.",
                    series.relative_path(), interval, attempt + 1, max_retries,
                )
                if attempt < max_retries - 1:
                    pause(backoff_base * (attempt + 1))
        assert last_exc is not None
        raise last_exc

    @classmethod
    def _is_rate_limited(cls, exc: Exception) -> bool:
        msg = str(exc).lower()
        return any(hint in msg for hint in cls._RATE_LIMIT_HINTS)

    # -- normalization -----------------------------------------------------
    @staticmethod
    def _normalize_payload(payload: Any) -> pd.DataFrame:
        """Coerce the MCP candles payload into a canonical OHLCV frame (UTC ms)."""
        rows = KlineIngestor._extract_rows(payload)
        records: list[dict[str, float | int]] = []
        for row in rows:
            records.append(KlineIngestor._coerce_row(row))
        if not records:
            return pd.DataFrame(columns=OHLCV_COLUMNS)
        frame = pd.DataFrame.from_records(records)
        frame["open_time"] = frame["open_time"].astype("int64")
        return frame[OHLCV_COLUMNS]

    @staticmethod
    def _extract_rows(payload: Any) -> list[Any]:
        if payload is None:
            return []
        if isinstance(payload, dict):
            for key in ("data", "candles", "result", "list"):
                value = payload.get(key)
                if isinstance(value, list):
                    return value
            return []
        if isinstance(payload, list):
            return payload
        return []

    @staticmethod
    def _coerce_row(row: Any) -> dict[str, float | int]:
        # Array form: [ts, open, high, low, close, volume, ...]
        if isinstance(row, (list, tuple)):
            return {
                "open_time": int(float(row[0])),
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5]) if len(row) > 5 else 0.0,
            }
        # Object form with flexible keys.
        if isinstance(row, dict):
            ts = row.get("open_time") or row.get("ts") or row.get("timestamp") or row.get("time")
            vol = row.get("volume") or row.get("baseVolume") or row.get("vol") or 0.0
            return {
                "open_time": int(float(ts)),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(vol),
            }
        raise ValueError(f"Unrecognized candle row shape: {row!r}")
