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


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All offline smoke tests passed.")


if __name__ == "__main__":
    _run_all()
