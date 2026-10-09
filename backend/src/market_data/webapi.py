"""FastAPI web API layer (#9a): thin HTTP/WS wrapper over market_data.

Bound to 127.0.0.1 for local self-use. Business logic stays in the existing
(tested) modules.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from collections.abc import Callable
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from market_data import blockbeats, blockbeats_cache, indicators, levels
from market_data.agent.store import ProjectionStore, proposal_meta
from market_data.alertstore import AlertStore
from market_data.chartstore import ChartStore
from market_data.config import Settings, get_settings
from market_data.db import Database, DatabaseUnavailable, get_database
from market_data.ingestion import KlineIngestor
from market_data.mcp_client import McpError
from market_data.models import Series
from market_data.news_broker import HEARTBEAT_SECONDS, NewsBroker, sse_frame
from market_data.realtime import BitgetWsStream
from market_data.smc import SmcEngine
from market_data.store import ParquetStore
from market_data.streamhub import MarketStream
from market_data.structure import StructureEngine

logger = logging.getLogger(__name__)

# Upper bound on `GET /candles` limit (matches `/candles/recent`'s 500 contract).
MAX_CANDLE_LIMIT = 500


# -- request bodies --------------------------------------------------------
class BackfillBody(BaseModel):
    category: str = "USDT-FUTURES"
    symbol: str
    timeframe: str
    before: int
    # 10 pages × ~90 days/page ≈ 900 days (1d) or ~1000 bars per call, enough
    # to cover the frontend's 500-bar backward request window in one round trip.
    max_pages: int = 10


class ChartConfigBody(BaseModel):
    category: str = "USDT-FUTURES"
    symbol: str
    timeframe: str
    state: dict


class AlertBody(BaseModel):
    symbol: str
    condition: str
    threshold: float
    enabled: bool = True
    triggered: bool = False
    createdAt: int | None = None
    color: str | None = None


class AlertPatchBody(BaseModel):
    symbol: str | None = None
    condition: str | None = None
    threshold: float | None = None
    enabled: bool | None = None
    triggered: bool | None = None
    color: str | None = None


# -- helpers ---------------------------------------------------------------
def _levels_json(lst) -> list[dict]:  # noqa: ANN001
    return [
        {
            "price": level.price,
            "kind": level.kind,
            "strength": level.strength,
            "sources": level.sources,
        }
        for level in lst
    ]


def create_app(
    settings: Settings | None = None,
    stream: BitgetWsStream | None = None,
    market: MarketStream | None = None,
    backfill_client_factory: Callable[[], Any] | None = None,
    backfill_rest_fetcher: Callable[[str, str, str, int, int], list] | None = None,
    news_broker: NewsBroker | None = None,
    projection_store: ProjectionStore | None = None,
    database: Database | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    # Fail-fast pool: a dead database raises DatabaseUnavailable (503 / startup
    # abort) instead of silently serving empty data.
    database = database or get_database(settings.postgres_dsn)
    blockbeats_cache.configure_database(database)
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
        # Schema bootstrap is the single startup migration point; a dead database
        # aborts startup (clear error) instead of serving empty data.
        database.bootstrap()
        # BlockBeats daily data cache: warm it up on startup (best-effort) so
        # the first frontend requests don't hit the upstream, then schedule a
        # daily refresh at 12:00 local time.
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger

        cache_scheduler = BackgroundScheduler()
        # Warm up only on a first ever run (empty cache). Restarts reuse the
        # existing snapshots; the daily cron job handles refreshes at 12:00.
        try:
            if not blockbeats_cache.has_cache():
                blockbeats_cache.refresh_all()
        except Exception as exc:  # noqa: BLE001 - warm-up is best-effort
            logger.warning("BlockBeats cache warm-up failed: %s", exc)
        cache_scheduler.add_job(
            blockbeats_cache.refresh_all,
            CronTrigger(
                hour=settings.blockbeats_refresh_hour, minute=settings.blockbeats_refresh_minute
            ),
            id="blockbeats_cache_refresh",
            max_instances=1,
            coalesce=True,
        )
        try:
            cache_scheduler.start()
        except Exception as exc:  # noqa: BLE001 - scheduler is best-effort
            logger.warning("BlockBeats cache scheduler start failed: %s", exc)
        # Incremental persistence: keep the parquet store current with the live
        # stream so history never lags real-time by more than one interval.
        # Without this, store stops at the last manual CLI pull and the chart
        # shows a gap between stored history and the live buffer. Uses the
        # REST-only job (public Bitget v3 endpoint) — no MCP/npx dependency.
        from market_data.scheduler import build_rest_scheduler

        ingest_scheduler: BackgroundScheduler | None = None
        # interval 0 disables background scheduling (tests / isolated runs).
        if settings.schedule_interval_seconds > 0:
            try:
                ingest_scheduler = build_rest_scheduler(store, settings)
                ingest_scheduler.start()
            except Exception as exc:  # noqa: BLE001 - scheduler is best-effort
                logger.warning("Incremental persistence scheduler start failed: %s", exc)
        _app.state.ingest_scheduler = ingest_scheduler
        try:
            stream.start()
        except Exception as exc:  # noqa: BLE001 - stream is best-effort
            logger.warning("Real-time stream start failed: %s", exc)
        try:
            market.start()
        except Exception as exc:  # noqa: BLE001 - market stream is best-effort
            logger.warning("Market stream start failed: %s", exc)
        try:
            news_broker.start()
        except Exception as exc:  # noqa: BLE001 - news poller is best-effort
            logger.warning("News broker start failed: %s", exc)
        try:
            yield
        finally:
            await stream.stop()
            await market.stop()
            news_broker.stop()
            cache_scheduler.shutdown(wait=False)
            if ingest_scheduler is not None:
                ingest_scheduler.shutdown(wait=False)

    app = FastAPI(title="AI Trading API", version="0.1.0", lifespan=_lifespan)

    @app.exception_handler(DatabaseUnavailable)
    async def _database_unavailable(_request, exc: DatabaseUnavailable) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    store = ParquetStore(database)
    chart_store = ChartStore(database)
    alert_store = AlertStore(database)
    # Agent projections are written by the standalone worker; FastAPI only reads.
    projection_store = projection_store or ProjectionStore(settings.agent_dir)

    # Global news pipeline: dedicated polling thread + SSE hub. Tests inject a
    # fake broker so no real AKShare network traffic happens in offline runs.
    news_broker = news_broker or NewsBroker()

    # Backfill throttling: per-series serialization + a small cross-series
    # concurrency cap (the MCP bridge is the bottleneck and Bitget rate
    # limits must not be tripped by parallel deep-history pulls).
    backfill_locks: dict[str, threading.Lock] = {}
    backfill_locks_guard = threading.Lock()
    backfill_sem = threading.Semaphore(2)

    def _default_client_factory() -> Any:
        from market_data.mcp_client import McpDataClient  # noqa: PLC0415

        return McpDataClient(settings.mcp_command, list(settings.mcp_args))

    client_factory = backfill_client_factory or _default_client_factory

    def _series(category: str, symbol: str, timeframe: str) -> Series:
        return Series(category, symbol, timeframe)

    def _read(category, symbol, timeframe, start=None, end=None, limit=None):  # noqa: ANN001
        return store.read(_series(category, symbol, timeframe), start, end, limit)

    def _seed_candles_from_rest(category, symbol, timeframe, limit=200) -> list[dict]:  # noqa: ANN001
        """Fetch recent klines from the Bitget public REST API (no auth).

        Used when a series has no live-stream buffer yet (e.g. a freshly
        switched symbol/timeframe), so history is available immediately.
        Realtime-only levels (e.g. `1s`) have no REST history and are skipped.
        """
        from market_data.models import (
            is_realtime_only_timeframe,
            timeframe_to_granularity,
            timeframe_to_spot_granularity,
        )

        # Realtime-only levels (e.g. `1s`) have no REST history; never seed them.
        if is_realtime_only_timeframe(timeframe):
            return []
        try:
            if category == "SPOT":
                granularity = timeframe_to_spot_granularity(timeframe)
            else:
                granularity = timeframe_to_granularity(timeframe)
        except ValueError:
            # Level has no granularity mapping -> nothing to seed.
            return []
        product_type = category if "FUTURES" in category else None
        params: dict = {"symbol": symbol, "granularity": granularity, "limit": min(limit, 200)}
        if product_type:
            params["productType"] = product_type
        url = "https://api.bitget.com/api/v2/mix/market/candles"
        if category == "SPOT":
            url = "https://api.bitget.com/api/v2/spot/market/candles"
            params.pop("productType", None)
        try:
            resp = httpx.get(url, params=params, timeout=10.0)
            resp.raise_for_status()
            body = resp.json()
            if body.get("code") not in ("00000", 0):
                return []
            rows = body.get("data") or []
            return [KlineIngestor._coerce_row(r) for r in rows][-limit:]
        except Exception:  # noqa: BLE001 - seed is best-effort
            return []

    @app.exception_handler(ValueError)
    async def _value_error(_req, exc: ValueError):  # noqa: ANN001
        return JSONResponse(status_code=400, content={"error": str(exc)})

    @app.exception_handler(McpError)
    async def _mcp_error(_req, exc: Exception):  # noqa: ANN001
        # Upstream MCP failures are a dependency outage (502), not an
        # unhandled 500; always surface a structured JSON body.
        return JSONResponse(status_code=502, content={"error": str(exc)})

    # -- core --------------------------------------------------------------
    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    # -- market ------------------------------------------------------------
    @app.get("/candles")
    def candles(
        symbol: str,
        timeframe: str,
        category: str = "USDT-FUTURES",
        start: int | None = None,
        end: int | None = None,
        limit: int = 500,
    ) -> dict:
        if limit < 1 or limit > MAX_CANDLE_LIMIT:
            raise HTTPException(status_code=422, detail="limit must be within 1..500")
        df = _read(category, symbol, timeframe, start, end, limit)
        rows = df.to_dict(orient="records")
        return {"series": f"{category}/{symbol}/{timeframe}", "count": len(rows), "candles": rows}

    @app.get("/candles/recent")
    def candles_recent(
        symbol: str, timeframe: str, category: str = "USDT-FUTURES", limit: int = 200
    ) -> dict:
        if limit > 500:
            raise HTTPException(status_code=422, detail="limit must be <= 500")
        bars = stream.recent(category, symbol, timeframe, limit=limit)
        if not bars:
            # A symbol/timeframe that isn't in the live buffer yet (e.g. a
            # freshly switched contract) still needs history: seed it from the
            # Bitget public REST candles endpoint, then subscribe the live
            # stream so subsequent requests get incremental updates.
            bars = _seed_candles_from_rest(category, symbol, timeframe, limit)
            stream.subscribe(category, symbol, timeframe)
        return {"series": f"{category}/{symbol}/{timeframe}", "count": len(bars), "candles": bars}

    @app.post("/candles/backfill")
    async def candles_backfill(body: BackfillBody) -> dict:
        if body.max_pages < 1 or body.max_pages > 20:
            raise HTTPException(status_code=422, detail="max_pages must be within 1..20")
        series = _series(body.category, body.symbol, body.timeframe)
        key = series.relative_path()

        def _run() -> tuple[int, bool]:
            with backfill_locks_guard:
                series_lock = backfill_locks.setdefault(key, threading.Lock())
            with series_lock, backfill_sem:
                # Deep history via the public v3 REST history-candles endpoint
                # (full history, no near-window depth cap); fall back to the
                # MCP bridge on persistent failures so existing capability
                # does not degrade.
                rest_fetcher = backfill_rest_fetcher or KlineIngestor._fetch_v3_history_page
                ingestor = KlineIngestor(None, store, page_limit=settings.v3_candle_page_limit)
                try:
                    return ingestor.backfill_before_rest(
                        series,
                        body.before,
                        fetch_page=rest_fetcher,
                        max_pages=body.max_pages,
                        page_delay=settings.backfill_page_delay,
                        parallel=True,
                        page_limit=settings.v3_candle_page_limit,
                    )
                except Exception as exc:  # noqa: BLE001 - REST failure -> MCP fallback
                    logger.warning("REST backfill failed for %s, falling back to MCP: %s", key, exc)
                    with client_factory() as client:
                        ingestor = KlineIngestor(
                            client, store, page_limit=settings.candle_page_limit
                        )
                        return ingestor.backfill_before(
                            series, body.before, max_pages=body.max_pages
                        )

        try:
            appended, earliest_reached = await asyncio.to_thread(_run)
        except Exception as exc:  # noqa: BLE001 - upstream fetch failure
            logger.warning("Backfill failed for %s: %s", key, exc)
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        return {"series": key, "appended": appended, "earliest_reached": earliest_reached}

    @app.get("/analyze")
    def analyze(symbol: str, timeframe: str, category: str = "USDT-FUTURES", top: int = 8) -> dict:
        df = _read(category, symbol, timeframe)
        if len(df) < 30:
            raise HTTPException(status_code=422, detail=f"insufficient data (rows={len(df)})")
        ind = indicators.compute(df).iloc[-1]
        keys = [
            "kdj_k",
            "kdj_d",
            "kdj_j",
            "vegas_ema144",
            "vegas_ema169",
        ]
        return {
            "price": float(df["close"].iloc[-1]),
            "indicators": {
                k: (None if ind.get(k) != ind.get(k) else float(ind.get(k))) for k in keys
            },
            "levels": _levels_json(levels.build_levels(df, top_n=top)),
        }

    @app.get("/levels")
    def levels_endpoint(
        symbol: str, timeframe: str, category: str = "USDT-FUTURES", top: int = 8
    ) -> dict:
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
        return {
            "symbol": symbol,
            "category": category,
            "asks": book["asks"],
            "bids": book["bids"],
            "seq": book["seq"],
        }

    @app.get("/books/{category}/{symbol}")
    def books_categorized(category: str, symbol: str) -> dict:
        book = market.orderbook(symbol, category=category)
        if book is None:
            return {"symbol": symbol, "category": category, "asks": [], "bids": [], "seq": None}
        return {
            "symbol": symbol,
            "category": category,
            "asks": book["asks"],
            "bids": book["bids"],
            "seq": book["seq"],
        }

    @app.get("/trades/{symbol}")
    def trades(symbol: str, limit: int = 50, category: str = "USDT-FUTURES") -> dict:
        return {
            "symbol": symbol,
            "category": category,
            "trades": market.trades(symbol, limit=limit, category=category),
        }

    @app.get("/trades/{category}/{symbol}")
    def trades_categorized(category: str, symbol: str, limit: int = 50) -> dict:
        return {
            "symbol": symbol,
            "category": category,
            "trades": market.trades(symbol, limit=limit, category=category),
        }

    @app.get("/funding")
    def funding(category: str | None = None) -> dict:
        return {"funding": [dict(f) for f in market.funding(category).values()]}

    @app.get("/mark-price")
    def mark_price(category: str | None = None) -> dict:
        return {"mark_prices": [dict(m) for m in market.mark_prices(category).values()]}

    @app.get("/instruments")
    def instruments(category: str | None = None) -> dict:
        return {"instruments": [dict(i) for i in market.instruments(category).values()]}

    # -- BlockBeats news / data proxy (key stays server-side) --------------
    @app.get("/blockbeats/newsflash/{type_}")
    def blockbeats_newsflash(type_: str, page: int = 1, size: int = 10, lang: str = "cn") -> dict:
        try:
            return blockbeats.fetch_newsflash(type_, page=page, size=size, lang=lang)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=502, detail=f"blockbeats upstream error: {exc}"
            ) from exc

    @app.get("/blockbeats/data/{endpoint}")
    def blockbeats_data(endpoint: str, network: str | None = None, type: str | None = None) -> dict:
        # Cache key resolution: for type-bearing endpoints (us10y/dxy) the
        # pre-cached granularity is 1M; top10_netflow is keyed by `network`.
        # Unknown endpoints raise (400) below via fetch_data's whitelist.
        cache_type = type or (
            blockbeats_cache.DEFAULT_TYPE if endpoint in blockbeats_cache.TYPE_END_POINTS else None
        )
        try:
            cached = blockbeats_cache.load_cache(endpoint, network=network, type=cache_type)
            if cached is not None:
                return {
                    "status": 0,
                    "data": cached.get("data"),
                    "from_cache": True,
                    "fetched_at": cached.get("fetched_at"),
                }
            # Cache miss -> live proxy. Forward ONLY the params the caller
            # explicitly provided; the proxy fills no defaults (upstream has
            # its own, e.g. type=1M).
            params = {k: v for k, v in {"network": network, "type": type}.items() if v is not None}
            body = blockbeats.fetch_data(endpoint, **params)
            return {"status": 0, "data": body.get("data"), "from_cache": False}
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=502, detail=f"blockbeats upstream error: {exc}"
            ) from exc

    @app.post("/blockbeats/data/refresh")
    def blockbeats_data_refresh() -> dict:
        try:
            return {
                "refreshed_at": datetime.now(UTC).isoformat(),
                "results": blockbeats_cache.refresh_all(),
            }
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=502, detail=f"blockbeats cache refresh failed: {exc}"
            ) from exc

    # -- Global news pipeline (AKShare -> SSE / context) ------------------
    @app.get("/news/categories")
    def news_categories() -> dict:
        return {"categories": news_broker.categories}

    @app.get("/news/context")
    def news_context(hours: int | None = None, category: str | None = None) -> dict:
        return {
            "items": news_broker.recent(hours=hours, categories=category),
            "generated_at": datetime.now(UTC).isoformat(),
        }

    @app.get("/news/history")
    def news_history(offset: int = 0, limit: int = 100, category: str | None = None) -> dict:
        """Page the ring buffer newest-first (0..buffer size)."""
        offset = max(0, offset)
        limit = min(200, max(1, limit))
        items, total = news_broker.page(offset=offset, limit=limit, categories=category)
        return {"items": items, "total": total}

    @app.get("/news/health")
    def news_health() -> dict:
        return {"status": "ok", **news_broker.health()}

    @app.get("/news/stream")
    async def news_stream() -> StreamingResponse:
        async def _event_gen():
            queue: asyncio.Queue = asyncio.Queue()
            news_broker.subscribe(queue)
            try:
                snap_items, snap_total = news_broker.snapshot()
                yield sse_frame(
                    "snapshot",
                    {
                        "items": snap_items,
                        "total": snap_total,
                        "sources": news_broker.health().get("sources", {}),
                    },
                )
                while True:
                    try:
                        item = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_SECONDS)
                    except TimeoutError:
                        yield ": ping\n\n"
                        continue
                    if item is None:
                        break
                    yield sse_frame("item", item)
            finally:
                news_broker.unsubscribe(queue)

        return StreamingResponse(
            _event_gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # -- agent research / execution projections (READ-ONLY, no LLM here) ---
    @app.get("/research/proposals")
    def research_proposals(symbol: str | None = None, limit: int = 50) -> dict:
        bounded = min(200, max(1, limit))
        items = projection_store.list_proposals(symbol=symbol, limit=bounded)
        return {"proposals": [proposal_meta(item) for item in items]}

    @app.get("/research/proposals/{proposal_id}")
    def research_proposal(proposal_id: str) -> dict:
        record = projection_store.get_proposal(proposal_id)
        if record is None:
            raise HTTPException(status_code=404, detail="proposal not found")
        return record

    @app.get("/executions/{run_id}")
    def execution_run(run_id: str) -> dict:
        record = projection_store.get_run(run_id)
        if record is None or record.get("kind") != "execution":
            raise HTTPException(status_code=404, detail="execution run not found")
        return record

    @app.get("/research/{thread_id}/stream")
    async def research_stream(thread_id: str) -> StreamingResponse:
        if not projection_store.stream_path(thread_id).exists():
            raise HTTPException(status_code=404, detail="stream not found")

        async def _event_gen():
            offset = 0
            idle = 0.0
            while True:
                events, offset = projection_store.read_stream(thread_id, offset)
                for event in events:
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                    if event.get("type") in ("done", "error"):
                        return
                await asyncio.sleep(0.2)
                idle += 0.2
                if idle >= 15.0:
                    idle = 0.0
                    yield ": ping\n\n"

        return StreamingResponse(
            _event_gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # -- chart config ------------------------------------------------------
    @app.get("/chart-config")
    def get_chart_config(symbol: str, timeframe: str, category: str = "USDT-FUTURES") -> dict:
        return chart_store.get(category, symbol, timeframe)

    @app.put("/chart-config")
    def put_chart_config(body: ChartConfigBody) -> dict:
        return chart_store.save(body.category, body.symbol, body.timeframe, body.state)

    # -- alerts (server-side persistence, cross-device) ---------------------
    @app.get("/alerts")
    def alerts_list() -> dict:
        return {"alerts": alert_store.list()}

    @app.post("/alerts")
    def alerts_create(body: AlertBody) -> dict:
        alert = alert_store.create(body.model_dump())  # raises ValueError -> 400
        return {"ok": True, "alert": alert}

    @app.put("/alerts/{alert_id}")
    def alerts_update(alert_id: str, body: AlertPatchBody) -> dict:
        patch = body.model_dump(exclude_unset=True)
        alert = alert_store.update(alert_id, patch)  # raises ValueError -> 400
        if alert is None:
            raise HTTPException(status_code=404, detail="alert not found")
        return {"ok": True, "alert": alert}

    @app.delete("/alerts/{alert_id}")
    def alerts_delete(alert_id: str) -> dict:
        if not alert_store.delete(alert_id):
            raise HTTPException(status_code=404, detail="alert not found")
        return {"ok": True}

    # -- websocket subscription protocol -----------------------------------
    def _snapshot(category: str, symbol: str, timeframe: str) -> dict:
        # Live stream is the primary source for the current bar; the parquet
        # store only supplies history/indicators and is NOT required for a
        # usable snapshot. Without a live bar we still return a structured
        # frame (with an explicit error) so the frontend never silently
        # discards real-time updates.
        bar = stream.latest(category, symbol, timeframe)
        if bar is None:
            df = _read(category, symbol, timeframe)
            if len(df) < 1:
                return {"error": "no data"}
            return {"price": float(df["close"].iloc[-1])}
        df = _read(category, symbol, timeframe)
        price = float(bar["close"])
        snap = {"price": price, "last_candle": bar}
        if len(df) >= 30:
            snap["levels"] = _levels_json(levels.build_levels(df, top_n=5))
        return snap

    @app.websocket("/ws")
    async def ws(sock: WebSocket) -> None:
        await sock.accept()
        # Subscriptions for this client keyed by the full series identity
        # (channel, category, symbol, timeframe). The candle channel is served
        # from the local store/stream snapshot; the rest come from the market
        # hub. Non-candle market channels carry no timeframe ("").
        subs: dict[tuple[str, str, str, str], dict] = {}
        send_lock = asyncio.Lock()

        async def send(obj: dict) -> None:
            async with send_lock:
                await sock.send_json(obj)

        def series_key(
            channel: str, category: str, symbol: str, timeframe: str
        ) -> tuple[str, str, str, str]:
            # a ticker subscription without a symbol means "full market"
            if channel == "ticker" and symbol in (None, "", "default", "*"):
                return "ticker", category, "*", ""
            return channel, category, symbol, timeframe

        def listener(category: str, channel: str, symbol: str, action: str, data) -> None:  # noqa: ANN001
            # Exact (cat,sym), per-symbol wildcard, or all-category wildcard.
            if (
                (channel, category, symbol, "") in subs
                or (channel, category, "*", "") in subs
                or (channel, "*", "*", "") in subs
            ):
                asyncio.create_task(
                    send(
                        {
                            "category": category,
                            "channel": channel,
                            "symbol": symbol,
                            "timeframe": "",
                            "action": action,
                            "data": data,
                        }
                    )
                )

        def hub_args(channel: str, symbol: str) -> tuple[str, str]:
            # full-market ticker is served from the REST-seeded mirror; no WS
            # per-symbol subscribe is issued for the wildcard subscription.
            return channel, symbol

        async def candle_loop() -> None:
            # Low-frequency indicator/S-R refresh only: pushes the full snapshot
            # (with levels/indicators) for subscribed candle series every ~5s.
            # Real-time price updates are event-driven via stream listeners.
            while True:
                await asyncio.sleep(5.0)
                for (channel, category, symbol, tf), _arg in list(subs.items()):
                    if channel != "candle":
                        continue
                    snap = _snapshot(category, symbol, tf)
                    if "error" in snap:
                        continue
                    # Ordering guard: never re-push a `last_candle` older than the
                    # most recent one already delivered via the event-driven push,
                    # otherwise the frontend chart would append an out-of-order
                    # bucket. Indicator/S-R fields are still delivered as usual.
                    skey = candle_series_key(category, symbol, tf)
                    bc = snap.get("last_candle")
                    if bc is not None:
                        open_time = int(bc["open_time"])
                        prev = candle_sent_open_time.get(skey)
                        if prev is not None and open_time < prev:
                            snap = {**snap, "last_candle": None}
                    await send(
                        {
                            "channel": "candle",
                            "category": category,
                            "symbol": symbol,
                            "timeframe": tf,
                            "action": "update",
                            "data": snap,
                        }
                    )

        # Event-driven real-time candle pushes. Each subscribed series gets a
        # stream listener whose update frames carry only `last_candle` + `price`
        # (no indicator/S-R recomputation), throttled to ~1s with "send latest"
        # coalescing so a quiet market never drops the newest bar.
        candle_throttle: dict[tuple[str, str, str], float] = {}
        candle_pending: dict[tuple[str, str, str], dict] = {}
        candle_timers: set[tuple[str, str, str]] = set()
        candle_listener_regs: dict[tuple[str, str, str], Callable[[dict], None]] = {}
        # Watermark of the most recent `last_candle.open_time` actually sent to
        # this connection per series. The ~5s poll snapshot must never re-push a
        # bar older than this, or the frontend chart would append an out-of-order
        # bucket and corrupt the ascending time series. The event-driven push is
        # the ordering authority; the poll loop only samples stream.latest().
        candle_sent_open_time: dict[tuple[str, str, str], int] = {}
        loop = asyncio.get_running_loop()

        def candle_series_key(category: str, symbol: str, timeframe: str) -> tuple[str, str, str]:
            return (category, symbol, timeframe)

        def candle_send(skey: tuple[str, str, str], frame: dict, open_time: int | None) -> None:
            """Send a candle frame and record the watermark for ordering."""
            if open_time is not None:
                prev = candle_sent_open_time.get(skey)
                if prev is None or open_time > prev:
                    candle_sent_open_time[skey] = open_time
            loop.create_task(send(frame))

        def candle_update_listener(
            category: str, symbol: str, timeframe: str
        ) -> Callable[[dict], None]:
            """Build a stream listener for one series of this connection."""
            skey = candle_series_key(category, symbol, timeframe)

            async def _flush() -> None:
                candle_timers.discard(skey)
                frame = candle_pending.pop(skey, None)
                if frame is not None:
                    candle_throttle[skey] = loop.time()
                    ot = frame.get("data", {}).get("last_candle", {}).get("open_time")
                    candle_send(skey, frame, ot)

            def _on_bar(bar: dict) -> None:
                # Only forward while this connection still holds the candle sub.
                if ("candle", category, symbol, timeframe) not in subs:
                    return
                frame = {
                    "channel": "candle",
                    "category": category,
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "action": "update",
                    "data": {"price": float(bar["close"]), "last_candle": bar},
                }
                now = loop.time()
                last = candle_throttle.get(skey, 0.0)
                if now - last >= 1.0:
                    candle_throttle[skey] = now
                    candle_send(skey, frame, int(bar["open_time"]))
                else:
                    candle_pending[skey] = frame
                    if skey not in candle_timers:
                        candle_timers.add(skey)
                        delay = 1.0 - (now - last)
                        loop.call_later(delay, lambda: asyncio.create_task(_flush()))

            return _on_bar

        def unregister_candle_listener(category: str, symbol: str, timeframe: str) -> None:
            skey = candle_series_key(category, symbol, timeframe)
            cb = candle_listener_regs.pop(skey, None)
            if cb is not None:
                stream.remove_listener(category, symbol, timeframe, cb)
            candle_throttle.pop(skey, None)
            candle_pending.pop(skey, None)
            candle_timers.discard(skey)
            candle_sent_open_time.pop(skey, None)

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
                        tf = arg.get("timeframe") or ("5m" if channel == "candle" else "")
                        key = series_key(channel, category, symbol, tf)
                        if op == "subscribe":
                            if channel == "candle":
                                # Idempotent: a repeated subscribe for a series
                                # this connection already holds must not bump
                                # the upstream refcount again (a leak would keep
                                # the feed subscribed and the buffer alive
                                # after every client is gone).
                                if key not in subs:
                                    stream.subscribe(category, symbol, tf)
                                    cb = candle_update_listener(category, symbol, tf)
                                    sk = candle_series_key(category, symbol, tf)
                                    candle_listener_regs[sk] = cb
                                    stream.add_listener(category, symbol, tf, cb)
                                subs[key] = arg
                                await send(
                                    {
                                        "category": category,
                                        "channel": channel,
                                        "symbol": symbol,
                                        "timeframe": tf,
                                        "action": "snapshot",
                                        "data": _snapshot(category, symbol, tf),
                                    }
                                )
                            elif channel == "ticker" and key[2] == "*":
                                # full-market list: served from the REST mirror;
                                # category "*" means all categories merged
                                subs[key] = arg
                                snap_cat = None if category in ("*", "default", "") else category
                                await send(
                                    {
                                        "category": category,
                                        "channel": "ticker",
                                        "symbol": symbol,
                                        "timeframe": "",
                                        "action": "snapshot",
                                        "data": market.tickers(snap_cat),
                                    }
                                )
                            else:
                                hchan, hsym = hub_args(channel, symbol)
                                # Same idempotency rule as the candle branch.
                                if key not in subs:
                                    market.subscribe(hchan, hsym, category)
                                subs[key] = arg
                                if channel == "ticker":
                                    await send(
                                        {
                                            "category": category,
                                            "channel": "ticker",
                                            "symbol": symbol,
                                            "timeframe": "",
                                            "action": "snapshot",
                                            "data": market.tickers(category),
                                        }
                                    )
                                else:
                                    snap = _market_snapshot(channel, symbol, category)
                                    if snap is not None:
                                        await send(
                                            {
                                                "category": category,
                                                "channel": channel,
                                                "symbol": symbol,
                                                "timeframe": "",
                                                "action": "snapshot",
                                                "data": snap,
                                            }
                                        )
                            await send(
                                {
                                    "channel": channel,
                                    "symbol": symbol,
                                    "category": category,
                                    "timeframe": tf,
                                    "event": "subscribed",
                                }
                            )
                        else:
                            hchan, hsym = hub_args(channel, symbol)
                            arg = subs.pop(key, None)
                            if channel == "candle" and arg is not None:
                                stream.unsubscribe(category, symbol, tf)
                                unregister_candle_listener(category, symbol, tf)
                            elif key[2] != "*":
                                market.unsubscribe(hchan, hsym, category)
                            await send(
                                {
                                    "channel": channel,
                                    "symbol": symbol,
                                    "category": category,
                                    "timeframe": tf,
                                    "event": "unsubscribed",
                                }
                            )
                elif msg.get("event") == "ping":
                    await send({"event": "pong"})
        finally:
            candle_task.cancel()
            for channel, category, symbol, tf in list(subs):
                if channel == "candle":
                    stream.unsubscribe(category, symbol, tf)
                    unregister_candle_listener(category, symbol, tf)
                    continue
                if channel == "ticker" and symbol == "*":
                    continue
                hchan, hsym = hub_args(channel, symbol)
                market.unsubscribe(hchan, hsym, category)
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
