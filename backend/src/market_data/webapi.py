"""FastAPI web API layer (#9a): thin HTTP/WS wrapper over market_data.

Bound to 127.0.0.1 for local self-use. Business logic stays in the existing
(tested) modules. Long tasks (backtest/pull) run in the background. Live orders
use a two-step confirm-token flow and always pass the #3/#4 risk gates.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager
from dataclasses import asdict

from fastapi import BackgroundTasks, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from market_data import dlquant, indicators, levels
from market_data.agent import build_agent_context
from market_data.appconfig import ConfigStore
from market_data.chartstore import ChartStore
from market_data.config import Settings, get_settings
from market_data.execution import ExecutionEngine, LiveBroker, OrderRequest
from market_data.llm import (
    LLMTextProvider,
    ProviderConfig,
    RuleBasedProvider,
    build_ollama_complete,
    build_openai_complete,
)
from market_data.memory import (
    MemoryStore,
    Reflector,
    TradeJournal,
    augment_context,
    features_from_context,
)
from market_data.models import Series
from market_data.orchestration import AgentCycle, RunControl
from market_data.realtime import BitgetWsStream
from market_data.risk import Portfolio, RiskEngine
from market_data.smc import SmcEngine
from market_data.store import ParquetStore
from market_data.streamhub import MarketStream
from market_data.structure import StructureEngine

logger = logging.getLogger(__name__)


# -- request bodies --------------------------------------------------------
class ControlBody(BaseModel):
    kill_switch: bool | None = None
    live_enabled: bool | None = None


class OrderBody(BaseModel):
    category: str = "USDT-FUTURES"
    symbol: str
    side: str  # long | short
    leverage: float = 100.0
    price: float


class ConfirmBody(BaseModel):
    token: str


class SeriesBody(BaseModel):
    category: str = "USDT-FUTURES"
    symbol: str
    timeframe: str


class ChartConfigBody(BaseModel):
    category: str = "USDT-FUTURES"
    symbol: str
    timeframe: str
    state: dict


# -- helpers ---------------------------------------------------------------
def _build_provider(cfg: ProviderConfig, system_prompt: str | None):
    if cfg.kind == "rule":
        return RuleBasedProvider(cfg)
    complete = build_ollama_complete(cfg) if cfg.kind == "ollama" else build_openai_complete(cfg)
    return LLMTextProvider(complete, cfg, system_prompt=system_prompt)


def _levels_json(lst) -> list[dict]:  # noqa: ANN001
    return [{"price": l.price, "kind": l.kind, "strength": l.strength, "sources": l.sources}
            for l in lst]


def create_app(
    settings: Settings | None = None,
    stream: BitgetWsStream | None = None,
    market: MarketStream | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    stream = stream or BitgetWsStream(
        url=settings.ws_public_url,
        category=settings.category,
        symbols=settings.symbols,
        timeframes=settings.timeframes,
        heartbeat_seconds=settings.ws_heartbeat_seconds,
        reconnect_seconds=settings.ws_reconnect_seconds,
    )
    market = market or MarketStream(
        url=settings.ws_public_url,
        categories=settings.categories,
        heartbeat_seconds=settings.ws_heartbeat_seconds,
        reconnect_seconds=settings.ws_reconnect_seconds,
    )

    @asynccontextmanager
    async def _lifespan(_app: FastAPI):
        try:
            stream.start()
        except Exception as exc:  # noqa: BLE001 - stream is best-effort
            logger.warning("Real-time stream start failed: %s", exc)
        try:
            market.start()
        except Exception as exc:  # noqa: BLE001 - market stream is best-effort
            logger.warning("Market stream start failed: %s", exc)
        try:
            yield
        finally:
            await stream.stop()
            await market.stop()

    app = FastAPI(title="AI Trading API", version="0.1.0", lifespan=_lifespan)

    store = ParquetStore(settings.parquet_dir)
    config_store = ConfigStore(settings.data_dir / "config" / "app.json")
    chart_store = ChartStore(settings.chart_config_path)
    journal = TradeJournal(settings.data_dir / "memory" / "trades.jsonl")
    engine = ExecutionEngine(portfolio=Portfolio(equity=1000.0))
    run_control = RunControl()
    jobs: dict[str, dict] = {}
    pending: dict[str, OrderBody] = {}

    def _series(category: str, symbol: str, timeframe: str) -> Series:
        return Series(category, symbol, timeframe)

    def _read(category, symbol, timeframe, start=None, end=None):  # noqa: ANN001
        return store.read(_series(category, symbol, timeframe), start, end)

    @app.exception_handler(ValueError)
    async def _value_error(_req, exc: ValueError):  # noqa: ANN001
        return JSONResponse(status_code=400, content={"error": str(exc)})

    # -- core --------------------------------------------------------------
    @app.get("/health")
    def health() -> dict:
        return {"status": "ok", "kill_switch": run_control.kill_switch,
                "live_enabled": run_control.paper_only is False}

    # -- market ------------------------------------------------------------
    @app.get("/candles")
    def candles(symbol: str, timeframe: str, category: str = "USDT-FUTURES",
                start: int | None = None, end: int | None = None, limit: int = 500) -> dict:
        df = _read(category, symbol, timeframe, start, end)
        rows = df.tail(limit).to_dict(orient="records")
        return {"series": f"{category}/{symbol}/{timeframe}", "count": len(rows), "candles": rows}

    @app.get("/candles/recent")
    def candles_recent(symbol: str, timeframe: str, category: str = "USDT-FUTURES",
                       limit: int = 200) -> dict:
        if limit > 500:
            raise HTTPException(status_code=422, detail="limit must be <= 500")
        bars = stream.recent(category, symbol, timeframe, limit=limit)
        return {"series": f"{category}/{symbol}/{timeframe}", "count": len(bars), "candles": bars}

    @app.get("/analyze")
    def analyze(symbol: str, timeframe: str, category: str = "USDT-FUTURES", top: int = 8) -> dict:
        df = _read(category, symbol, timeframe)
        if len(df) < 30:
            raise HTTPException(status_code=422, detail=f"insufficient data (rows={len(df)})")
        ind = indicators.compute(df).iloc[-1]
        keys = ["dif", "dea", "macd_hist", "kdj_k", "kdj_d", "kdj_j",
                "boll_lower", "boll_mid", "boll_upper", "vegas_ema144", "vegas_ema169"]
        return {
            "price": float(df["close"].iloc[-1]),
            "indicators": {k: (None if ind.get(k) != ind.get(k) else float(ind.get(k))) for k in keys},
            "levels": _levels_json(levels.build_levels(df, top_n=top)),
        }

    @app.get("/levels")
    def levels_endpoint(symbol: str, timeframe: str, category: str = "USDT-FUTURES",
                        top: int = 8) -> dict:
        df = _read(category, symbol, timeframe)
        if df.empty:
            raise HTTPException(status_code=422, detail="no data")
        return {"levels": _levels_json(levels.build_levels(df, top_n=top))}

    @app.get("/structure")
    def structure(symbol: str, timeframe: str, category: str = "USDT-FUTURES") -> dict:
        df = _read(category, symbol, timeframe)
        if len(df) < 30:
            raise HTTPException(status_code=422, detail="insufficient data")
        st = StructureEngine.analyze(df)
        sm = SmcEngine.analyze(df)
        return {
            "swings": [asdict(s) for s in st["swings"]],
            "trendlines": [asdict(t) for t in st["trendlines"]],
            "box": asdict(st["box"]) if st["box"] else None,
            "liquidity": [asdict(x) for x in sm["liquidity"]],
            "order_blocks": {k: (asdict(v) if v else None) for k, v in sm["order_blocks"].items()},
            "bos_choch": [asdict(e) for e in sm["bos_choch"]],
        }

    # -- exchange market hub (REST snapshots) ------------------------------
    @app.get("/tickers")
    def tickers(category: str | None = None) -> dict:
        data = market.tickers(category)
        return {"tickers": [dict(t) for t in data.values()]}

    @app.get("/books/{symbol}")
    def books(symbol: str, category: str = "USDT-FUTURES") -> dict:
        book = market.orderbook(symbol, category=category)
        if book is None:
            return {"symbol": symbol, "category": category, "asks": [], "bids": [], "seq": None}
        return {"symbol": symbol, "category": category, "asks": book["asks"], "bids": book["bids"], "seq": book["seq"]}

    @app.get("/books/{category}/{symbol}")
    def books_categorized(category: str, symbol: str) -> dict:
        book = market.orderbook(symbol, category=category)
        if book is None:
            return {"symbol": symbol, "category": category, "asks": [], "bids": [], "seq": None}
        return {"symbol": symbol, "category": category, "asks": book["asks"], "bids": book["bids"], "seq": book["seq"]}

    @app.get("/trades/{symbol}")
    def trades(symbol: str, limit: int = 50, category: str = "USDT-FUTURES") -> dict:
        return {"symbol": symbol, "category": category, "trades": market.trades(symbol, limit=limit, category=category)}

    @app.get("/trades/{category}/{symbol}")
    def trades_categorized(category: str, symbol: str, limit: int = 50) -> dict:
        return {"symbol": symbol, "category": category, "trades": market.trades(symbol, limit=limit, category=category)}

    @app.get("/funding")
    def funding(category: str | None = None) -> dict:
        return {"funding": [dict(f) for f in market.funding(category).values()]}

    @app.get("/mark-price")
    def mark_price(category: str | None = None) -> dict:
        return {"mark_prices": [dict(m) for m in market.mark_prices(category).values()]}

    @app.get("/instruments")
    def instruments(category: str | None = None) -> dict:
        return {"instruments": [dict(i) for i in market.instruments(category).values()]}

    # -- background jobs (backtest / pull) --------------------------------
    def _run_backtest(job_id: str, category: str, symbol: str, timeframe: str) -> None:
        try:
            df = _read(category, symbol, timeframe)
            jobs[job_id] = {"status": "done", "result": dlquant.run_pipeline(df)}
        except Exception as exc:  # noqa: BLE001
            jobs[job_id] = {"status": "error", "error": str(exc)}

    @app.post("/backtest")
    def backtest(body: SeriesBody, bg: BackgroundTasks) -> dict:
        job_id = uuid.uuid4().hex[:12]
        jobs[job_id] = {"status": "running"}
        bg.add_task(_run_backtest, job_id, body.category, body.symbol, body.timeframe)
        return {"job_id": job_id}

    @app.get("/jobs/{job_id}")
    def job_status(job_id: str) -> dict:
        if job_id not in jobs:
            raise HTTPException(status_code=404, detail="job not found")
        return {"job_id": job_id, **jobs[job_id]}

    # -- config ------------------------------------------------------------
    @app.get("/config")
    def get_config() -> dict:
        return config_store.load()

    @app.put("/config")
    def put_config(body: dict) -> dict:
        return config_store.save(body)  # raises ValueError -> 400

    # -- chart config ------------------------------------------------------
    @app.get("/chart-config")
    def get_chart_config(symbol: str, timeframe: str, category: str = "USDT-FUTURES") -> dict:
        return chart_store.get(category, symbol, timeframe)

    @app.put("/chart-config")
    def put_chart_config(body: ChartConfigBody) -> dict:
        return chart_store.save(body.category, body.symbol, body.timeframe, body.state)

    # -- agent -------------------------------------------------------------
    def _augmented_decision(df, category, symbol, timeframe):  # noqa: ANN001
        cfg_data = config_store.load()
        cfg = ProviderConfig(**cfg_data["provider"])
        cfg.category = category
        ctx = build_agent_context(df, symbol, timeframe)
        feats = features_from_context(ctx)
        memories = MemoryStore(journal).retrieve(feats, k=3)
        rules = list(cfg_data.get("manual_rules", [])) + Reflector().distill_rules(journal.all())
        aug = augment_context(ctx, memories, rules)
        provider = _build_provider(cfg, cfg_data.get("system_prompt"))
        return provider.propose(aug), cfg

    @app.post("/agent/decide")
    def agent_decide(body: SeriesBody) -> dict:
        df = _read(body.category, body.symbol, body.timeframe)
        if len(df) < 30:
            raise HTTPException(status_code=422, detail="insufficient data")
        decision, _cfg = _augmented_decision(df, body.category, body.symbol, body.timeframe)
        return asdict(decision)

    @app.post("/agent/cycle")
    def agent_cycle(body: SeriesBody) -> dict:
        df = _read(body.category, body.symbol, body.timeframe)
        if len(df) < 30:
            raise HTTPException(status_code=422, detail="insufficient data")
        cfg = config_store.provider_config()
        cfg.category = body.category
        cycle = AgentCycle(provider=_build_provider(cfg, config_store.load().get("system_prompt")),
                           engine=engine, memory_store=MemoryStore(journal),
                           journal=journal, run_control=run_control, cfg=cfg)
        price = float(df["close"].iloc[-1])
        return cycle.step(df, body.symbol, body.timeframe, price)

    @app.get("/portfolio")
    def portfolio() -> dict:
        p = engine.portfolio
        return {"equity": p.equity, "peak_equity": p.peak_equity,
                "positions": {s: asdict(pos) for s, pos in p.positions.items()}}

    @app.get("/journal")
    def get_journal() -> dict:
        return {"trades": [asdict(t) for t in journal.all()]}

    # -- control + live order flow ----------------------------------------
    @app.put("/control")
    def control(body: ControlBody) -> dict:
        if body.kill_switch is not None:
            run_control.kill_switch = body.kill_switch
        if body.live_enabled is not None:
            run_control.paper_only = not body.live_enabled
        return {"kill_switch": run_control.kill_switch, "live_enabled": not run_control.paper_only}

    @app.post("/order")
    def order(body: OrderBody) -> dict:
        if not run_control.can_trade():
            raise HTTPException(status_code=403, detail="kill-switch active")
        decision = RiskEngine(config_store.risk_config()).check_order(
            engine.portfolio, body.symbol, body.leverage)
        if not decision.approved:
            raise HTTPException(status_code=400, detail=f"risk rejected: {decision.reason}")
        token = uuid.uuid4().hex
        pending[token] = body
        return {"token": token, "preview": {"margin": decision.margin,
                "notional": decision.notional, "leverage": decision.leverage}}

    @app.post("/order/confirm")
    def order_confirm(body: ConfirmBody) -> dict:
        if not run_control.can_trade():
            raise HTTPException(status_code=403, detail="kill-switch active")
        ob = pending.pop(body.token, None)
        if ob is None:
            raise HTTPException(status_code=400, detail="invalid or used token")
        req = OrderRequest(ob.category, ob.symbol, ob.side, ob.leverage, ob.price)
        if not run_control.paper_only:  # live
            from market_data.mcp_client import McpDataClient
            client = McpDataClient(settings.mcp_command, settings.mcp_args)
            client.start()
            try:
                broker = LiveBroker(client, ob.category, enabled=True, confirm=lambda: True)
                live = ExecutionEngine(risk_engine=RiskEngine(config_store.risk_config()),
                                       broker=broker, portfolio=engine.portfolio)
                res = live.place(req, ob.price)
            finally:
                client.close()
        else:
            res = engine.place(req, ob.price)
        return {"approved": res.approved, "filled": res.filled, "reason": res.reason, "live": not run_control.paper_only}

    # -- websocket subscription protocol -----------------------------------
    def _snapshot(category: str, symbol: str, timeframe: str) -> dict:
        df = _read(category, symbol, timeframe)
        if len(df) < 1:
            return {"error": "no data"}
        bar = stream.latest(category, symbol, timeframe)
        price = float(bar["close"]) if bar else float(df["close"].iloc[-1])
        snap = {"price": price,
                "portfolio": {"equity": engine.portfolio.equity,
                              "positions": list(engine.portfolio.positions.keys())}}
        if bar:
            snap["last_candle"] = bar
        if len(df) >= 30:
            snap["levels"] = _levels_json(levels.build_levels(df, top_n=5))
            ind = indicators.compute(df).iloc[-1]
            snap["macd_hist"] = None if ind["macd_hist"] != ind["macd_hist"] else float(ind["macd_hist"])
        return snap

    @app.websocket("/ws")
    async def ws(sock: WebSocket) -> None:
        await sock.accept()
        # channel/symbol subscriptions for this client; each entry maps the
        # event key (channel, symbol) to the original subscribe args. The
        # candle channel is served from the local store/stream snapshot; the
        # rest come from the market hub.
        subs: dict[tuple[str, str], dict] = {}
        send_lock = asyncio.Lock()

        async def send(obj: dict) -> None:
            async with send_lock:
                await sock.send_json(obj)

        def listener(category: str, channel: str, symbol: str, action: str, data) -> None:  # noqa: ANN001
            if (channel, symbol) in subs or (channel, "*") in subs:
                asyncio.create_task(send(
                    {"category": category, "channel": channel, "symbol": symbol,
                     "action": action, "data": data}))

        def event_key(channel: str, symbol: str) -> tuple[str, str]:
            # a ticker subscription without a symbol means "full market"
            if channel == "ticker" and symbol in (None, "", "default", "*"):
                return "ticker", "*"
            return channel, symbol

        def hub_args(channel: str, symbol: str) -> tuple[str, str]:
            # full-market ticker is served from the REST-seeded mirror; no WS
            # per-symbol subscribe is issued for the wildcard subscription.
            return channel, symbol

        async def candle_loop() -> None:
            # keep pushing candle snapshots at the subscription's interval
            while True:
                await asyncio.sleep(5.0)
                for (channel, symbol), arg in list(subs.items()):
                    if channel != "candle":
                        continue
                    tf = arg.get("timeframe") or "5m"
                    category = arg.get("category") or "USDT-FUTURES"
                    await send({"channel": "candle", "symbol": symbol, "action": "update",
                                "data": _snapshot(category, symbol, tf)})

        market.add_listener(listener)
        candle_task = asyncio.create_task(candle_loop())
        try:
            while True:
                try:
                    raw = await sock.receive_text()
                except WebSocketDisconnect:
                    break
                try:
                    msg = json.loads(raw)
                except (TypeError, ValueError):
                    continue
                if not isinstance(msg, dict):
                    continue
                op = msg.get("op")
                args = msg.get("args") or []
                if op in ("subscribe", "unsubscribe"):
                    for arg in args:
                        if not isinstance(arg, dict):
                            continue
                        channel = arg.get("channel") or ""
                        symbol = arg.get("symbol") or ("BTCUSDT" if channel != "ticker" else "")
                        category = arg.get("category") or "USDT-FUTURES"
                        key = event_key(channel, symbol)
                        if op == "subscribe":
                            if channel == "candle":
                                subs[key] = arg
                                tf = arg.get("timeframe") or "5m"
                                await send({"category": category, "channel": channel, "symbol": symbol,
                                            "action": "snapshot",
                                            "data": _snapshot(category, symbol, tf)})
                            elif channel == "ticker" and key == ("ticker", "*"):
                                # full-market list: served from the REST mirror
                                subs[key] = arg
                                await send({"category": category, "channel": "ticker", "symbol": symbol,
                                            "action": "snapshot",
                                            "data": market.tickers(category)})
                            else:
                                hchan, hsym = hub_args(channel, symbol)
                                subs[key] = arg
                                market.subscribe(hchan, hsym, category)
                                if channel == "ticker":
                                    await send({"category": category, "channel": "ticker", "symbol": symbol,
                                                "action": "snapshot",
                                                "data": market.tickers(category)})
                                else:
                                    snap = _market_snapshot(channel, symbol, category)
                                    if snap is not None:
                                        await send({"category": category, "channel": channel, "symbol": symbol,
                                                    "action": "snapshot", "data": snap})
                            await send({"channel": channel, "symbol": symbol, "category": category,
                                        "event": "subscribed"})
                        else:
                            hchan, hsym = hub_args(channel, symbol)
                            subs.pop(key, None)
                            if key != ("ticker", "*"):
                                market.unsubscribe(hchan, hsym, category)
                            await send({"channel": channel, "symbol": symbol, "category": category,
                                        "event": "unsubscribed"})
                elif msg.get("event") == "ping":
                    await send({"event": "pong"})
        finally:
            candle_task.cancel()
            for (channel, symbol) in list(subs):
                if channel == "candle":
                    continue
                if channel == "ticker" and (channel, symbol) == ("ticker", "*"):
                    continue
                hchan, hsym = hub_args(channel, symbol)
                arg = subs.get((channel, symbol)) or {}
                market.unsubscribe(hchan, hsym, arg.get("category") or "USDT-FUTURES")
            market.remove_listener(listener)

    def _market_snapshot(channel: str, symbol: str, category: str = "USDT-FUTURES") -> dict | None:
        if channel == "books":
            book = market.orderbook(symbol, category=category)
            if book is None:
                return None
            return book
        if channel == "trade":
            return {"trades": market.trades(symbol, limit=50, category=category)}
        if channel == "mark-price":
            mp = market.mark_prices(category).get(symbol)
            return {"mark_price": mp} if mp else None
        if channel == "funding-time":
            f = market.funding(category).get(symbol)
            return {"funding": f} if f else None
        return None

    return app
