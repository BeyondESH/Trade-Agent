"""K-line ingestion via MCP (tasks 3.1-3.4)."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from market_data.mcp_client import McpDataClient
from market_data.models import (
    OHLCV_COLUMNS,
    Series,
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


class KlineIngestor:
    def __init__(
        self,
        client: McpDataClient,
        store: ParquetStore,
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
