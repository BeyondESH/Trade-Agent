"""Command-line entry point wiring the market-data pipeline together.

Serves as the runnable harness for the end-to-end verification tasks (7.x):

    market-data discover
    market-data pull   --symbol BTCUSDT --timeframe 5m --start 2024-01-01 --end 2024-01-02 --export
    market-data incremental --symbol BTCUSDT --timeframe 5m --start 2024-01-01 --end 2024-01-03
    market-data gaps   --symbol BTCUSDT --timeframe 5m
    market-data schedule --once
    market-data agent-worker
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import UTC, datetime

from market_data.config import get_settings, setup_logging
from market_data.excel_export import export_series
from market_data.ingestion import KlineIngestor
from market_data.mcp_client import McpDataClient
from market_data.models import Series
from market_data.scheduler import build_scheduler, run_incremental_pull
from market_data.store import ParquetStore

logger = logging.getLogger(__name__)


def _to_ms(value: str) -> int:
    """Parse an ISO date/datetime (UTC) or raw epoch-ms string into epoch ms."""
    if value.isdigit():
        return int(value)
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return int(dt.timestamp() * 1000)


def _series(args: argparse.Namespace, settings) -> Series:  # noqa: ANN001
    return Series(
        category=args.category or settings.category,
        symbol=args.symbol,
        timeframe=args.timeframe,
    )


def main() -> None:
    setup_logging()
    settings = get_settings()

    parser = argparse.ArgumentParser(prog="market-data")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("discover", help="List MCP tools and inspect the market domain")

    for name in ("pull", "incremental"):
        p = sub.add_parser(name)
        p.add_argument("--category", default=None)
        p.add_argument("--symbol", required=True)
        p.add_argument("--timeframe", required=True)
        p.add_argument("--start", required=True, help="ISO date or epoch ms")
        p.add_argument("--end", required=True, help="ISO date or epoch ms")
        p.add_argument("--export", action="store_true", help="also export to Excel")

    g = sub.add_parser("gaps")
    g.add_argument("--category", default=None)
    g.add_argument("--symbol", required=True)
    g.add_argument("--timeframe", required=True)

    s = sub.add_parser("schedule")
    s.add_argument("--once", action="store_true", help="run one pull and exit")

    a = sub.add_parser("analyze", help="compute indicators + S/R from stored data")
    a.add_argument("--category", default=None)
    a.add_argument("--symbol", required=True)
    a.add_argument("--timeframe", required=True)
    a.add_argument("--start", default=None, help="ISO date or epoch ms")
    a.add_argument("--end", default=None, help="ISO date or epoch ms")
    a.add_argument("--top", type=int, default=8, help="top-N S/R candidates")

    sv = sub.add_parser("serve", help="run the FastAPI web API (localhost)")
    sv.add_argument("--host", default="127.0.0.1")
    sv.add_argument("--port", type=int, default=8000)

    aw = sub.add_parser("agent-worker", help="run the autonomous research + paper-execution worker")
    aw.add_argument("--once", action="store_true", help="run one cycle and exit")

    args = parser.parse_args()

    if args.command == "agent-worker":
        from market_data.agent.runtime import AgentRuntime

        runtime = AgentRuntime(settings)
        if args.once:
            result = runtime.run_once()
            print(
                f"cycle {result.status}: proposal={result.proposal_id} "
                f"run={result.execution_run_id} reason={result.reason}"
            )
            runtime.stop()
            return
        runtime.start()
        print(f"Agent worker started (every {settings.agent_loop_seconds}s). Ctrl+C to stop.")
        try:
            while True:
                time.sleep(1)
        except (KeyboardInterrupt, SystemExit):
            runtime.stop()
        return

    if args.command == "serve":
        import uvicorn

        from market_data.webapi import create_app

        uvicorn.run(create_app(), host=args.host, port=args.port)
        return

    if args.command == "discover":
        from market_data.discover import main as discover_main

        discover_main()
        return

    store = ParquetStore(settings.parquet_dir)

    if args.command == "analyze":
        from market_data import indicators, levels

        series = _series(args, settings)
        start_ms = _to_ms(args.start) if args.start else None
        end_ms = _to_ms(args.end) if args.end else None
        df = store.read(series, start_ms, end_ms)
        if len(df) < 30:
            print(f"Not enough data for {series.relative_path()} (rows={len(df)}, need >=30).")
            return
        ind = indicators.compute(df).iloc[-1]
        print(
            f"=== {series.relative_path()} | rows={len(df)} | close={df['close'].iloc[-1]:.2f} ==="
        )
        print(
            "KDJ k={:.1f} d={:.1f} j={:.1f} | VEGAS144={:.2f} VEGAS169={:.2f}".format(
                ind["kdj_k"],
                ind["kdj_d"],
                ind["kdj_j"],
                ind["vegas_ema144"],
                ind["vegas_ema169"],
            )
        )
        print(f"--- Top-{args.top} S/R candidates ---")
        for lvl in levels.build_levels(df, top_n=args.top):
            print(
                f"  {lvl.kind:10s} {lvl.price:12.2f}  strength={lvl.strength:.1f}  "
                f"sources={','.join(lvl.sources)}"
            )
        return

    if args.command == "gaps":
        with McpDataClient(settings.mcp_command, settings.mcp_args) as client:
            ingestor = KlineIngestor(client, store, page_limit=settings.candle_page_limit)
            gaps = ingestor.find_gaps(_series(args, settings))
        print(f"Missing bars: {len(gaps)}")
        return

    if args.command in ("pull", "incremental"):
        series = _series(args, settings)
        start_ms, end_ms = _to_ms(args.start), _to_ms(args.end)
        with McpDataClient(settings.mcp_command, settings.mcp_args) as client:
            ingestor = KlineIngestor(client, store, page_limit=settings.candle_page_limit)
            if args.command == "pull":
                frame = ingestor.fetch_range(series, start_ms, end_ms)
                added = store.save(series, frame)
            else:
                added = ingestor.ingest_incremental(series, start_ms, end_ms)
        print(f"Added {added} rows to {series.relative_path()}.")
        if args.export:
            paths = export_series(store, series, settings.excel_dir)
            print(
                f"Exported {len(paths)} daily file(s) to "
                f"{settings.excel_dir / series.relative_path()}."
            )
        return

    if args.command == "schedule":
        with McpDataClient(settings.mcp_command, settings.mcp_args) as client:
            ingestor = KlineIngestor(client, store, page_limit=settings.candle_page_limit)
            if args.once:
                run_incremental_pull(ingestor, settings)
                print("Ran one incremental pull.")
                return
            scheduler = build_scheduler(ingestor, settings)
            scheduler.start()
            print(
                f"Scheduler started (every {settings.schedule_interval_seconds}s). Ctrl+C to stop."
            )
            try:
                while True:
                    time.sleep(1)
            except (KeyboardInterrupt, SystemExit):
                scheduler.shutdown()


if __name__ == "__main__":
    main()
