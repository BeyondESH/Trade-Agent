"""Scheduled incremental ingestion (tasks 6.1, 6.2).

A reusable APScheduler-based skeleton with one incremental-pull job. Later
`automation-orchestration` reuses this. Job failures are logged and never
break subsequent runs.
"""

from __future__ import annotations

import logging
import time

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
                from market_data.models import timeframe_step_ms

                start_ms = end_ms - timeframe_step_ms(timeframe) * lookback_ms
                added = ingestor.ingest_incremental(series, start_ms, end_ms)
                logger.info("Incremental pull %s: +%d rows.", series.relative_path(), added)
            except Exception:  # noqa: BLE001 - isolate per-target failures
                logger.error(
                    "Incremental pull failed for %s.", series.relative_path(), exc_info=True
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
