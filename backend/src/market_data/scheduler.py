"""Scheduled incremental ingestion (tasks 6.1, 6.2).

A reusable APScheduler-based skeleton with one incremental-pull job. Later
`automation-orchestration` reuses this. Job failures are logged and never
break subsequent runs.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler

from market_data.config import Settings
from market_data.ingestion import KlineIngestor
from market_data.models import Series

logger = logging.getLogger(__name__)


def _now_ms() -> int:
    return int(time.time() * 1000)


def run_incremental_pull(ingestor: KlineIngestor, settings: Settings) -> None:
    """One incremental pull across the configured targets (task 6.1).

    Wrapped so a single target failure is logged but does not abort the run
    or future schedules (task 6.2).
    """
    end_ms = _now_ms()
    # On a fresh store, seed a bounded lookback window (one page worth).
    lookback_ms = settings.candle_page_limit
    for symbol in settings.symbols:
        for timeframe in settings.timeframes:
            series = Series(settings.category, symbol, timeframe)
            try:
                from market_data.models import is_realtime_only_timeframe, timeframe_step_ms

                # Realtime-only levels have no history to persist.
                if is_realtime_only_timeframe(timeframe):
                    continue
                start_ms = end_ms - timeframe_step_ms(timeframe) * lookback_ms
                added = ingestor.ingest_incremental(series, start_ms, end_ms)
                logger.info("Incremental pull %s: +%d rows.", series.relative_path(), added)
            except Exception:  # noqa: BLE001 - isolate per-target failures
                logger.error(
                    "Incremental pull failed for %s.", series.relative_path(), exc_info=True
                )


def run_incremental_pull_rest(store: Any, settings: Settings) -> None:
    """REST-only incremental persistence for the webapi lifespan.

    Fills each configured series from its store's latest bar forward to now
    via the public Bitget v3 history-candles endpoint (no MCP/npx dependency,
    so it works in the plain uvicorn runtime). Per-target failures are logged
    and never abort the run.
    """
    from market_data.ingestion import KlineIngestor
    from market_data.models import (
        is_realtime_only_timeframe,
        timeframe_step_ms,
        timeframe_to_granularity,
    )

    end_ms = _now_ms()
    lookback_ms = settings.candle_page_limit
    for symbol in settings.symbols:
        for timeframe in settings.timeframes:
            series = Series(settings.category, symbol, timeframe)
            try:
                if is_realtime_only_timeframe(timeframe):
                    continue
                step = timeframe_step_ms(timeframe)
                latest = store.latest_open_time(series)
                if latest is None:
                    # Fresh series: seed a bounded lookback window.
                    start_ms = end_ms - step * lookback_ms
                else:
                    start_ms = latest + step
                if start_ms >= end_ms:
                    continue
                granularity = timeframe_to_granularity(timeframe)
                rows = KlineIngestor._fetch_v3_history_page(
                    series.category, series.symbol, granularity, end_ms, 100
                )
                frame = KlineIngestor._normalize_payload(rows)
                if frame.empty:
                    continue
                frame = frame[
                    (frame["open_time"] >= start_ms) & (frame["open_time"] <= end_ms)
                ]
                if frame.empty:
                    continue
                added = store.save(series, frame)
                logger.info(
                    "REST incremental %s: +%d rows.", series.relative_path(), added
                )
            except Exception:  # noqa: BLE001 - isolate per-target failures
                logger.error(
                    "REST incremental failed for %s.", series.relative_path(), exc_info=True
                )


def build_scheduler(ingestor: KlineIngestor, settings: Settings) -> BackgroundScheduler:
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        run_incremental_pull,
        trigger="interval",
        seconds=settings.schedule_interval_seconds,
        args=[ingestor, settings],
        id="incremental_pull",
        max_instances=1,
        coalesce=True,
    )
    return scheduler


def build_rest_scheduler(store: Any, settings: Settings) -> BackgroundScheduler:
    """Scheduler for the REST-only incremental persistence used by the webapi
    lifespan (no MCP/npx dependency)."""
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        run_incremental_pull_rest,
        trigger="interval",
        seconds=settings.schedule_interval_seconds,
        args=[store, settings],
        id="incremental_pull_rest",
        max_instances=1,
        coalesce=True,
    )
    return scheduler
