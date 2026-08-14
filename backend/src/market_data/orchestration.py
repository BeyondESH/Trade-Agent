"""Automation & orchestration (#8): wire all components into an unattended loop.

Closes the memory loop from #6 at the orchestration layer (without modifying the
archived agent): build context -> retrieve memories + rules -> augment -> decide
-> risk execution (#4, paper by default) -> on close, journal + reflect (#6).

Also provides run-control (kill-switch, default paper) and kill-switch-aware
scheduled jobs (data pull / agent cycle / DL retrain), reusing APScheduler.
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass

import pandas as pd
from apscheduler.schedulers.background import BackgroundScheduler

from market_data.agent import build_agent_context
from market_data.execution import ExecutionEngine, OrderRequest
from market_data.llm import AgentDecision, ProviderConfig, RuleBasedProvider
from market_data.memory import (
    MemoryStore,
    Reflector,
    TradeJournal,
    TradeRecord,
    augment_context,
    features_from_context,
)
from market_data.models import Series
from market_data.store import ParquetStore

logger = logging.getLogger(__name__)


@dataclass
class RunControl:
    paper_only: bool = True
    kill_switch: bool = False
    enabled: bool = True

    def can_trade(self) -> bool:
        return self.enabled and not self.kill_switch


def _now_ms() -> int:
    return int(time.time() * 1000)


class AgentCycle:
    """One full memory-augmented agent trading step."""

    def __init__(
        self,
        provider=None,  # noqa: ANN001
        engine: ExecutionEngine | None = None,
        memory_store: MemoryStore | None = None,
        reflector: Reflector | None = None,
        journal: TradeJournal | None = None,
        run_control: RunControl | None = None,
        cfg: ProviderConfig | None = None,
        complete=None,  # noqa: ANN001 - optional LLM for reflection
    ) -> None:
        self.cfg = cfg or ProviderConfig()
        self.provider = provider or RuleBasedProvider(self.cfg)
        self.engine = engine or ExecutionEngine()
        self.journal = journal or TradeJournal("data/memory/trades.jsonl")
        self.memory_store = memory_store or MemoryStore(self.journal)
        self.reflector = reflector or Reflector()
        self.run_control = run_control or RunControl()
        self._complete = complete
        self._open_meta: dict[str, dict] = {}

    # -- memory-augmented decision (closes #6 loop) -----------------------
    def decide(self, df: pd.DataFrame, symbol: str, timeframe: str, news: str | None = None):
        ctx = build_agent_context(df, symbol, timeframe, news)
        feats = features_from_context(ctx)
        memories = self.memory_store.retrieve(feats, k=3)
        rules = self.reflector.distill_rules(self.journal.all())
        augmented = augment_context(ctx, memories, rules)
        decision = self.provider.propose(augmented)
        return decision, augmented, feats, len(memories)

    def step(
        self, df: pd.DataFrame, symbol: str, timeframe: str, price: float, news: str | None = None
    ) -> dict:
        if not self.run_control.can_trade():
            return {"status": "halted", "reason": "kill-switch or disabled"}

        decision, _aug, feats, n_mem = self.decide(df, symbol, timeframe, news)
        pos = self.engine.portfolio.positions.get(symbol)

        if decision.action == "open" and pos is None and decision.side in ("long", "short"):
            order = OrderRequest(self.cfg.category, symbol, decision.side, self.cfg.leverage, price)
            res = self.engine.place(order, price)
            if res.filled:
                self._open_meta[symbol] = {
                    "timeframe": timeframe,
                    "entry_price": price,
                    "features": feats,
                    "reason": decision.reason,
                    "opened_at": _now_ms(),
                }
            return {"status": "open", "filled": res.filled, "reason": res.reason,
                    "memories": n_mem, "decision": decision.action}

        if decision.action == "close" and pos is not None:
            pnl = self.close_position(symbol, price, decision.reason)
            return {"status": "close", "pnl": pnl, "memories": n_mem}

        return {"status": "hold", "memories": n_mem, "decision": decision.action}

    # -- close + journal + reflect ----------------------------------------
    def close_position(self, symbol: str, price: float, reason: str = "") -> float | None:
        pos = self.engine.portfolio.positions.get(symbol)
        if pos is None:
            return None
        meta = self._open_meta.get(symbol, {})
        side, notional, margin, leverage = pos.side, pos.notional, pos.margin, pos.leverage
        pnl = self.engine.close(symbol, price)
        record = TradeRecord(
            id=uuid.uuid4().hex[:12],
            symbol=symbol,
            timeframe=meta.get("timeframe", ""),
            side=side,
            entry_price=meta.get("entry_price", pos.entry_price),
            exit_price=price,
            notional=notional,
            margin=margin,
            leverage=leverage,
            pnl=pnl,
            opened_at=meta.get("opened_at", 0),
            closed_at=_now_ms(),
            strategy="agent-left-side",
            reason=reason,
            features=meta.get("features", {}),
        )
        record.reflection = self.reflector.reflect(record, self._complete)
        self.journal.append(record)
        self._open_meta.pop(symbol, None)
        return pnl

    def enforce(self, price: float) -> list[float]:
        to_close = self.engine.enforce_circuit_breaker()
        pnls: list[float] = []
        for pos in to_close:
            pnl = self.close_position(pos.symbol, price, "circuit breaker")
            if pnl is not None:
                pnls.append(pnl)
        return pnls


# -- scheduled jobs --------------------------------------------------------
def run_agent_cycle(cycle: AgentCycle, store: ParquetStore, settings) -> list[dict]:  # noqa: ANN001
    """Run one agent step per configured symbol/timeframe."""
    out: list[dict] = []
    for symbol in settings.symbols:
        for timeframe in settings.timeframes:
            series = Series(settings.category, symbol, timeframe)
            try:
                df = store.read(series)
                if len(df) < 30:
                    continue
                price = float(df["close"].iloc[-1])
                out.append({series.relative_path(): cycle.step(df, symbol, timeframe, price)})
            except Exception:  # noqa: BLE001 - isolate per-target failures
                logger.error("agent cycle failed for %s", series.relative_path(), exc_info=True)
    return out


def run_retrain(store: ParquetStore, settings) -> list[dict]:  # noqa: ANN001
    from market_data import dlquant

    out: list[dict] = []
    for symbol in settings.symbols:
        for timeframe in settings.timeframes:
            series = Series(settings.category, symbol, timeframe)
            try:
                metrics = dlquant.run_pipeline(store.read(series))
                out.append({series.relative_path(): metrics})
            except Exception:  # noqa: BLE001
                logger.error("retrain failed for %s", series.relative_path(), exc_info=True)
    return out


def build_orchestrator(
    cycle: AgentCycle,
    data_pull,  # noqa: ANN001 - callable()
    store: ParquetStore,
    settings,  # noqa: ANN001
    run_control: RunControl,
) -> BackgroundScheduler:
    scheduler = BackgroundScheduler()

    def _data_job() -> None:
        try:
            data_pull()
        except Exception:  # noqa: BLE001
            logger.error("data_pull job failed", exc_info=True)

    def _agent_job() -> None:
        if not run_control.can_trade():
            logger.info("agent_cycle skipped (kill-switch/disabled).")
            return
        try:
            run_agent_cycle(cycle, store, settings)
        except Exception:  # noqa: BLE001
            logger.error("agent_cycle job failed", exc_info=True)

    def _retrain_job() -> None:
        try:
            run_retrain(store, settings)
        except Exception:  # noqa: BLE001
            logger.error("retrain job failed", exc_info=True)

    interval = settings.schedule_interval_seconds
    scheduler.add_job(_data_job, "interval", seconds=interval, id="data_pull",
                      max_instances=1, coalesce=True)
    scheduler.add_job(_agent_job, "interval", seconds=interval, id="agent_cycle",
                      max_instances=1, coalesce=True)
    scheduler.add_job(_retrain_job, "interval", seconds=interval * 12, id="retrain",
                      max_instances=1, coalesce=True)
    return scheduler
