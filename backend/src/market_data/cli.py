"""Command-line entry point wiring the market-data pipeline together.

Serves as the runnable harness for the end-to-end verification tasks (7.x):

    market-data discover
    market-data pull   --symbol BTCUSDT --timeframe 5m --start 2024-01-01 --end 2024-01-02 --export
    market-data incremental --symbol BTCUSDT --timeframe 5m --start 2024-01-01 --end 2024-01-03
    market-data gaps   --symbol BTCUSDT --timeframe 5m
    market-data schedule --once
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import datetime, timezone

import pandas as pd

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
        dt = dt.replace(tzinfo=timezone.utc)
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

    rc = sub.add_parser("risk-check", help="demo position sizing + risk decision")
    rc.add_argument("--equity", type=float, required=True)
    rc.add_argument("--leverage", type=float, required=True)
    rc.add_argument("--symbol", default="BTCUSDT")

    tr = sub.add_parser("trade", help="paper trade demo: place then close")
    tr.add_argument("--equity", type=float, required=True)
    tr.add_argument("--symbol", default="BTCUSDT")
    tr.add_argument("--side", choices=["long", "short"], default="long")
    tr.add_argument("--leverage", type=float, default=100.0)
    tr.add_argument("--entry", type=float, required=True)
    tr.add_argument("--exit", type=float, required=True)
    tr.add_argument("--category", default="USDT-FUTURES")

    ag = sub.add_parser("agent", help="run the AI agent on stored data (paper)")
    ag.add_argument("--category", default=None)
    ag.add_argument("--symbol", required=True)
    ag.add_argument("--timeframe", required=True)
    ag.add_argument("--equity", type=float, default=1000.0)
    ag.add_argument("--news", default=None)

    sub.add_parser("memory", help="show trade journal stats, rules, param suggestions")

    bt = sub.add_parser("backtest", help="DL/ML quant backtest on stored data")
    bt.add_argument("--category", default=None)
    bt.add_argument("--symbol", required=True)
    bt.add_argument("--timeframe", required=True)
    bt.add_argument("--train-ratio", type=float, default=0.7)
    bt.add_argument("--thresh", type=float, default=0.55)

    orc = sub.add_parser("orchestrate", help="run one memory-augmented agent cycle (paper)")
    orc.add_argument("--category", default=None)
    orc.add_argument("--symbol", required=True)
    orc.add_argument("--timeframe", required=True)
    orc.add_argument("--equity", type=float, default=1000.0)

    sv = sub.add_parser("serve", help="run the FastAPI web API (localhost)")
    sv.add_argument("--host", default="127.0.0.1")
    sv.add_argument("--port", type=int, default=8000)

    args = parser.parse_args()

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

    if args.command == "orchestrate":
        from market_data.execution import ExecutionEngine
        from market_data.llm import ProviderConfig
        from market_data.memory import MemoryStore, Reflector, TradeJournal
        from market_data.orchestration import AgentCycle, RunControl
        from market_data.risk import Portfolio

        series = _series(args, settings)
        df = store.read(series)
        if len(df) < 30:
            print(f"Not enough data for {series.relative_path()} (rows={len(df)}).")
            return
        journal = TradeJournal(settings.data_dir / "memory" / "trades.jsonl")
        cycle = AgentCycle(
            engine=ExecutionEngine(portfolio=Portfolio(equity=args.equity)),
            memory_store=MemoryStore(journal),
            reflector=Reflector(),
            journal=journal,
            run_control=RunControl(),
            cfg=ProviderConfig(category=series.category),
        )
        price = float(df["close"].iloc[-1])
        result = cycle.step(df, series.symbol, series.timeframe, price)
        print(f"=== orchestrate {series.relative_path()} | price={price:.2f} ===")
        print(f"cycle result: {result}")
        return

    if args.command == "backtest":
        from market_data import dlquant

        series = _series(args, settings)
        df = store.read(series)
        metrics = dlquant.run_pipeline(df, train_ratio=args.train_ratio, thresh=args.thresh)
        print(f"=== backtest {series.relative_path()} | bars={len(df)} ===")
        for k, v in metrics.items():
            print(f"  {k}: {v}")
        return

    if args.command == "memory":
        from market_data.memory import Reflector, TradeJournal

        journal = TradeJournal(settings.data_dir / "memory" / "trades.jsonl")
        trades = journal.all()
        closed = [t for t in trades if t.is_closed]
        reflector = Reflector()
        print(f"=== trade memory === total={len(trades)} closed={len(closed)}")
        rules = reflector.distill_rules(trades)
        print("rules:")
        for r in rules or ["(none)"]:
            print(f"  - {r}")
        sug = reflector.suggest_param_adjustments(trades)
        print(f"param suggestions: {sug or '(none / insufficient samples)'}")
        return

    if args.command == "agent":
        from market_data.agent import TradingAgent
        from market_data.execution import ExecutionEngine, ExecutionResult
        from market_data.llm import ProviderConfig
        from market_data.risk import Portfolio

        series = _series(args, settings)
        df = store.read(series)
        if len(df) < 30:
            print(f"Not enough data for {series.relative_path()} (rows={len(df)}).")
            return
        cfg = ProviderConfig(category=series.category)
        engine = ExecutionEngine(portfolio=Portfolio(equity=args.equity))
        agent = TradingAgent(engine=engine, cfg=cfg)
        decision = agent.run(df, series.symbol, series.timeframe, args.news)
        price = float(df["close"].iloc[-1])
        print(f"=== agent {series.relative_path()} | price={price:.2f} ===")
        print(
            f"decision: {decision.action} side={decision.side} "
            f"ref={decision.reference_price} conf={decision.confidence} reason='{decision.reason}'"
        )
        result = agent.act(decision, price)
        if isinstance(result, ExecutionResult):
            print(f"execution: approved={result.approved} filled={result.filled} reason='{result.reason}'")
        elif result is None:
            print("execution: no action (hold)")
        return

    if args.command == "risk-check":
        from market_data.risk import (
            Portfolio,
            RiskEngine,
            liquidation_move_pct,
            stop_move_pct,
        )

        engine = RiskEngine()
        portfolio = Portfolio(equity=args.equity)
        decision = engine.check_order(portfolio, args.symbol, args.leverage)
        print(f"=== risk-check {args.symbol} equity={args.equity} lev={args.leverage} ===")
        print(
            f"decision: approved={decision.approved} margin={decision.margin:.2f} "
            f"notional={decision.notional:.2f} lev={decision.leverage:.0f} "
            f"reason='{decision.reason}'"
        )
        if decision.approved:
            liq = liquidation_move_pct(decision.notional, args.equity)
            stop = stop_move_pct(decision.notional, args.equity, engine.config)
            print(f"liquidation move ~{liq:.2%} | stop (drawdown) move ~{stop:.2%}")
            print(f"stop earlier than liquidation: {stop < liq}")
        return

    if args.command == "trade":
        from market_data.execution import ExecutionEngine, OrderRequest
        from market_data.risk import Portfolio

        engine = ExecutionEngine(portfolio=Portfolio(equity=args.equity))
        order = OrderRequest(args.category, args.symbol, args.side, args.leverage, args.entry)
        res = engine.place(order, args.entry)
        print(f"=== paper trade {args.symbol} {args.side} lev={args.leverage} ===")
        print(f"place: approved={res.approved} filled={res.filled} reason='{res.reason}'")
        if res.filled and res.position:
            p = res.position
            print(f"  position: margin={p.margin:.2f} notional={p.notional:.2f} entry={p.entry_price}")
            pnl = engine.close(args.symbol, args.exit)
            print(f"close @ {args.exit}: pnl={pnl:.2f} | equity={engine.portfolio.equity:.2f}")
        return

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
        print(f"=== {series.relative_path()} | rows={len(df)} | close={df['close'].iloc[-1]:.2f} ===")
        print(
            "MACD dif={:.2f} dea={:.2f} hist={:.2f} | KDJ k={:.1f} d={:.1f} j={:.1f}".format(
                ind["dif"], ind["dea"], ind["macd_hist"], ind["kdj_k"], ind["kdj_d"], ind["kdj_j"]
            )
        )
        print(
            "BOLL [{:.2f}, {:.2f}, {:.2f}] | VEGAS144={:.2f} VEGAS169={:.2f}".format(
                ind["boll_lower"], ind["boll_mid"], ind["boll_upper"],
                ind["vegas_ema144"], ind["vegas_ema169"],
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
            print(f"Exported {len(paths)} daily file(s) to {settings.excel_dir / series.relative_path()}.")
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
