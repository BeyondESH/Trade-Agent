"""Offline smoke test with a fake MCP client (no Node/network needed).

Covers the pure-Python data logic + boundary branches:
- pagination + normalization (3.1/3.2)
- Parquet daily-partition dedup/merge + read (4.1-4.3)
- incremental only fills the gap, no duplicates (3.3 / task 7.2)
- gap detection (3.4)
- Excel one-shot (per-day) + batched append (5.1/5.2)
- node-missing error, reconnect-retry, scheduler failure isolation

Run:
    python tests/test_offline.py     # from backend/ with PYTHONPATH=src
    pytest                           # if pytest installed
"""

from __future__ import annotations

import asyncio
import tempfile
import time
import types
from pathlib import Path

from market_data import mcp_client
from market_data.excel_export import ExcelAppender, export_frame
from market_data.ingestion import KlineIngestor
from market_data.mcp_client import McpError, _op_with_retry, check_node_version
from market_data.models import Series, timeframe_step_ms
from market_data.scheduler import run_incremental_pull
from market_data.store import ParquetStore

STEP = timeframe_step_ms("5m")
BASE = 1_700_000_000_000


class FakeClient:
    """Returns synthetic [ts,o,h,l,c,v] candles ending at endTime, walking back
    to a data floor at BASE (mirrors Bitget candlesHistory semantics)."""

    def call_tool(self, name, arguments):  # noqa: ANN001
        end = int(arguments["endTime"])
        limit = int(arguments["limit"])
        rows = []
        t = end
        while len(rows) < limit and t >= BASE:
            rows.append([t, 100.0, 101.0, 99.0, 100.5, 10.0])
            t -= STEP
        return {"data": rows}


def _series() -> Series:
    return Series("USDT-FUTURES", "BTCUSDT", "5m")


def test_pagination_and_store_dedup() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = ParquetStore(Path(tmp))
        ingestor = KlineIngestor(FakeClient(), store, page_limit=5)  # small -> forces paging
        series = _series()
        end = BASE + STEP * 19  # 20 bars, page_limit 5 -> 4 pages
        frame = ingestor.fetch_range(series, BASE, end)
        assert len(frame) == 20, f"expected 20 bars, got {len(frame)}"
        added = store.save(series, frame)
        assert added == 20
        # Save again -> no duplicates.
        added_again = store.save(series, frame)
        assert added_again == 0, "re-saving must add 0 rows (dedup)"
        assert len(store.read(series)) == 20


def test_incremental_only_fills_gap() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = ParquetStore(Path(tmp))
        ingestor = KlineIngestor(FakeClient(), store, page_limit=1000)
        series = _series()
        end1 = BASE + STEP * 9
        ingestor.ingest_incremental(series, BASE, end1)  # 10 bars
        assert len(store.read(series)) == 10
        end2 = BASE + STEP * 19
        added = ingestor.ingest_incremental(series, BASE, end2)  # only 10 new
        assert added == 10, f"incremental should add 10, added {added}"
        frame = store.read(series)
        assert len(frame) == 20
        assert frame["open_time"].is_monotonic_increasing
        assert frame["open_time"].nunique() == 20  # no duplicates


def test_gap_detection() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = ParquetStore(Path(tmp))
        ingestor = KlineIngestor(FakeClient(), store, page_limit=1000)
        series = _series()
        ingestor.ingest_incremental(series, BASE, BASE + STEP * 4)  # bars 0..4
        # Manually punch a hole by rewriting the store without bar 2.
        frame = store.read(series)
        frame = frame[frame["open_time"] != BASE + STEP * 2]  # remove bar 2
        store.delete(series)
        store.save(series, frame)
        gaps = ingestor.find_gaps(series)
        assert BASE + STEP * 2 in gaps, "removed bar should be reported as a gap"


def test_excel_export() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = ParquetStore(Path(tmp))
        ingestor = KlineIngestor(FakeClient(), store, page_limit=1000)
        series = _series()
        frame = ingestor.fetch_range(series, BASE, BASE + STEP * 9)
        out = export_frame(frame, Path(tmp) / "one_shot.xlsx")
        assert out.exists()
        # batched appender
        append_path = Path(tmp) / "append.xlsx"
        with ExcelAppender(append_path, batch_size=3) as app:
            app.append(frame.iloc[:5])
            app.append(frame.iloc[5:])
        assert append_path.exists()


def test_node_missing_raises() -> None:
    original = mcp_client.shutil.which
    mcp_client.shutil.which = lambda _name: None
    try:
        raised = False
        try:
            check_node_version()
        except McpError:
            raised = True
        assert raised, "check_node_version must raise McpError when node is absent"
    finally:
        mcp_client.shutil.which = original


def test_reconnect_retries_once() -> None:
    attempts = {"n": 0}
    reconnects = {"n": 0}

    async def op(session):  # noqa: ANN001
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise RuntimeError("transport dead")
        return f"ok:{session}"

    async def reconnect():
        reconnects["n"] += 1
        return "session-2"

    result, session = asyncio.run(_op_with_retry(op, "session-1", reconnect))
    assert result == "ok:session-2"
    assert session == "session-2"
    assert attempts["n"] == 2 and reconnects["n"] == 1


class _FailingIngestor:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def ingest_incremental(self, series, start_ms, end_ms):  # noqa: ANN001
        self.calls.append(series.relative_path())
        raise RuntimeError("boom")


def test_scheduler_isolates_failures() -> None:
    ingestor = _FailingIngestor()
    settings = types.SimpleNamespace(
        symbols=["BTCUSDT", "ETHUSDT"],
        timeframes=["5m"],
        category="USDT-FUTURES",
        candle_page_limit=100,
    )
    # Must not raise even though every target fails, and must attempt all targets.
    run_incremental_pull(ingestor, settings)
    assert ingestor.calls == ["USDT-FUTURES/BTCUSDT/5m", "USDT-FUTURES/ETHUSDT/5m"]


class _RestStore:
    """ParquetStore-like stand-in for the REST incremental job."""

    def __init__(self, latest) -> None:  # noqa: ANN001
        self._latest = latest
        self.saved: list[Series] = []

    def latest_open_time(self, series: Series) -> int | None:  # noqa: ANN001
        return self._latest

    def save(self, series: Series, frame) -> int:  # noqa: ANN001
        self.saved.append(series)
        return len(frame)


def test_rest_incremental_fills_gap(monkeypatch) -> None:  # noqa: ANN001
    from market_data import scheduler as scheduler_mod
    from market_data.scheduler import run_incremental_pull_rest

    # series: 5m, latest bar at BASE -> should fetch rows > BASE and save them.
    rows = [
        [BASE + STEP, 100.0, 101.0, 99.0, 100.5, 10.0],
        [BASE + 2 * STEP, 100.5, 102.0, 100.0, 101.5, 11.0],
    ]
    monkeypatch.setattr(
        KlineIngestor, "_fetch_v3_history_page",
        staticmethod(lambda category, symbol, granularity, end_ms, limit: rows),
    )
    store = _RestStore(latest=BASE)
    settings = types.SimpleNamespace(
        symbols=["BTCUSDT"],
        timeframes=["5m"],
        category="USDT-FUTURES",
        candle_page_limit=100,
    )
    run_incremental_pull_rest(store, settings)
    assert store.saved == [Series("USDT-FUTURES", "BTCUSDT", "5m")]


def test_rest_incremental_skips_when_up_to_date(monkeypatch) -> None:  # noqa: ANN001
    from market_data import scheduler as scheduler_mod  # noqa: F401
    from market_data.scheduler import run_incremental_pull_rest

    called = []

    def fake_fetch(*_a, **_k):  # noqa: ANN002, ANN003
        called.append(1)
        return []

    monkeypatch.setattr(
        KlineIngestor, "_fetch_v3_history_page", staticmethod(fake_fetch)
    )
    # latest within the current second => start_ms >= end_ms, no fetch.
    store = _RestStore(latest=int(time.time() * 1000) + 100_000)
    settings = types.SimpleNamespace(
        symbols=["BTCUSDT"],
        timeframes=["5m"],
        category="USDT-FUTURES",
        candle_page_limit=100,
    )
    run_incremental_pull_rest(store, settings)
    assert called == []
    assert store.saved == []


def test_rest_incremental_failure_isolated(monkeypatch) -> None:  # noqa: ANN001
    from market_data.scheduler import run_incremental_pull_rest

    def boom(*_a, **_k):  # noqa: ANN002, ANN003
        raise RuntimeError("rest down")

    monkeypatch.setattr(KlineIngestor, "_fetch_v3_history_page", staticmethod(boom))
    store = _RestStore(latest=None)  # fresh series -> seeds lookback
    settings = types.SimpleNamespace(
        symbols=["BTCUSDT", "ETHUSDT"],
        timeframes=["5m"],
        category="USDT-FUTURES",
        candle_page_limit=100,
    )
    # Must not raise, and attempt both symbols.
    run_incremental_pull_rest(store, settings)
    assert store.saved == []


def test_build_rest_scheduler_registers_job() -> None:  # noqa: ANN001
    from market_data.scheduler import build_rest_scheduler

    store = _RestStore(latest=0)
    settings = types.SimpleNamespace(
        symbols=["BTCUSDT"], timeframes=["5m"], category="USDT-FUTURES",
        candle_page_limit=100, schedule_interval_seconds=300,
    )
    sched = build_rest_scheduler(store, settings)
    try:
        job_ids = [j.id for j in sched.get_jobs()]
        assert "incremental_pull_rest" in job_ids
    finally:
        if sched.running:
            sched.shutdown(wait=False)


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All offline smoke tests passed.")


if __name__ == "__main__":
    _run_all()
