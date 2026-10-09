"""Agent worker runtime: both graphs on one PostgresSaver + the autonomous loop.

Tier-1 (research, LLM) and Tier-2 (execution, deterministic) are physically
separate compiled graphs sharing one ``PostgresSaver`` (different ``thread_id``).
This worker is the ONLY checkpointer writer; FastAPI reads projections only. The
loop is single-instance and honours the kill-switch (blocks *starting* execution
runs, never research).
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import psycopg
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg.rows import dict_row

from market_data.agent.broker import PaperBroker
from market_data.agent.execution import Quote, RiskLimits, build_execution_graph
from market_data.agent.proposal import StrategyProposal
from market_data.agent.research import build_research_graph
from market_data.agent.store import ProjectionStore
from market_data.agent.streaming import capture_stream
from market_data.agent.tools import ResearchTools, build_research_tools
from market_data.config import Settings
from market_data.events import EventLog
from market_data.models import Series
from market_data.store import ParquetStore

logger = logging.getLogger(__name__)

RESEARCH_PROMPT = (
    "Produce one strategy proposal for {symbol} ({category}) on the {timeframe} timeframe. "
    "Use the read-only tools, delegate deep dives to your subagents, then return the "
    "structured proposal with concrete evidence."
)


# Outcome of one autonomous cycle; `run_once` never raises it out.
@dataclass(frozen=True)
class CycleResult:
    status: str
    research_thread_id: str = ""
    proposal_id: str | None = None
    execution_run_id: str | None = None
    reason: str = ""


class AgentRuntime:
    """Owns the two graphs, the checkpointer and the scheduled loop."""

    def __init__(
        self,
        settings: Settings,
        *,
        store: ProjectionStore | None = None,
        broker: PaperBroker | None = None,
        market: Callable[[str, str], Quote | None] | None = None,
        tools: ResearchTools | None = None,
        model: Any | None = None,
        checkpointer: Any | None = None,
        events: EventLog | None = None,
        clock: Callable[[], datetime] | None = None,
        kill_switch: bool | None = None,
    ) -> None:
        self.settings = settings
        self.store = store or ProjectionStore(settings.agent_dir)
        self.parquet = ParquetStore(dsn=settings.postgres_dsn)
        self.broker = broker or PaperBroker(
            settings.agent_paper_equity, settings.agent_max_drawdown
        )
        self.market = market
        self.tools = tools
        self.model = model
        self.events = events
        self.clock = clock or (lambda: datetime.now(UTC))
        self.kill_switch = settings.agent_kill_switch if kill_switch is None else kill_switch
        self._symbols = list(settings.symbols) or ["BTCUSDT"]
        self._timeframe = settings.timeframes[0] if settings.timeframes else "1h"
        self._lock = threading.Lock()
        self._cycle = 0
        self._checkpointer = checkpointer
        self._conn: psycopg.Connection | None = None
        self._scheduler: Any | None = None
        self.research_graph: Any | None = None
        self.execution_graph: Any | None = None

    # -- assembly ----------------------------------------------------------
    def build(self) -> AgentRuntime:
        """Assemble both graphs on a single PostgresSaver (idempotent)."""
        if self.research_graph is not None and self.execution_graph is not None:
            return self
        self.settings.agent_dir.mkdir(parents=True, exist_ok=True)
        saver = self._checkpointer or self._build_postgres_checkpointer()
        toolset = self.tools or build_research_tools(self.settings)
        self.research_graph = build_research_graph(
            self.settings, tools=toolset, checkpointer=saver, model=self.model
        )
        self.execution_graph = build_execution_graph(
            broker=self.broker,
            market=self.market or self._default_market,
            limits=RiskLimits.from_settings(self.settings),
            checkpointer=saver,
            events=self.events,
            kill_switch=False,  # the runtime gate decides whether a run starts
            clock=self.clock,
        )
        return self

    def _build_postgres_checkpointer(self) -> PostgresSaver:
        """Open the worker's long-lived sync connection and ensure the schema.

        The APScheduler worker is synchronous, so the sync `PostgresSaver` (not
        `AsyncPostgresSaver`) is the right choice; the connection is kept on the
        instance and closed in `stop()`. `autocommit` + `dict_row` mirror the
        options `PostgresSaver.from_conn_string` applies (its context manager
        would close the connection on block exit, which a resident worker cannot
        use). The async FastAPI side will need `AsyncPostgresSaver` when it reads
        checkpoints directly — today it reads projection files instead.
        """
        self._conn = psycopg.connect(
            self.settings.postgres_dsn,
            autocommit=True,
            prepare_threshold=0,
            row_factory=dict_row,
        )
        saver = PostgresSaver(self._conn)
        saver.setup()
        return saver

    def _default_market(self, symbol: str, category: str) -> Quote | None:
        # Resolve an entry quote from the Parquet store (deterministic, no LLM).
        try:
            frame = self.parquet.read(Series(category, symbol, self._timeframe), limit=1)
        except Exception:  # noqa: BLE001 - missing data is simply "not tradable"
            return None
        if frame.empty:
            return None
        row = frame.iloc[-1]
        return Quote(symbol=symbol, price=float(row["close"]), ts=int(row["open_time"]))

    # -- loop --------------------------------------------------------------
    def run_once(self) -> CycleResult:
        # Single-instance: a concurrent call is skipped, never queued.
        if not self._lock.acquire(blocking=False):
            logger.info("agent cycle skipped: previous cycle still running")
            return CycleResult(status="skipped", reason="previous cycle still running")
        try:
            if self.research_graph is None or self.execution_graph is None:
                self.build()
            return self._run_cycle()
        except Exception as exc:  # noqa: BLE001 - the loop must survive a bad cycle
            logger.exception("agent cycle failed")
            return CycleResult(status="error", reason=str(exc))
        finally:
            self._lock.release()

    def _run_cycle(self) -> CycleResult:
        moment = self.clock()
        now_ms = int(moment.timestamp() * 1000)
        iso = moment.astimezone(UTC).isoformat()
        symbol = self._symbols[self._cycle % len(self._symbols)]
        self._cycle += 1
        category = self.settings.category
        research_thread = f"research:{now_ms}-{symbol}"
        prompt = RESEARCH_PROMPT.format(symbol=symbol, category=category, timeframe=self._timeframe)

        final = capture_stream(
            self.research_graph,
            research_thread,
            {"messages": [{"role": "user", "content": prompt}]},
            self.store,
        )
        proposal = self._extract_proposal(final, research_thread)
        if proposal is None:
            self.store.append_run(
                {
                    "run_id": research_thread,
                    "kind": "research",
                    "thread_id": research_thread,
                    "status": "failed",
                    "reason": "no structured_response",
                    "started_at": iso,
                    "finished_at": self.clock().astimezone(UTC).isoformat(),
                }
            )
            return CycleResult(
                status="no_proposal",
                research_thread_id=research_thread,
                reason="no structured_response",
            )

        if not proposal.provenance.research_thread_id:
            provenance = proposal.provenance.model_copy(
                update={"research_thread_id": research_thread}
            )
            proposal = proposal.model_copy(update={"provenance": provenance})
        self.store.append_proposal(proposal)
        self.store.append_run(
            {
                "run_id": research_thread,
                "kind": "research",
                "thread_id": research_thread,
                "proposal_id": proposal.proposal_id,
                "status": "ok",
                "started_at": iso,
                "finished_at": self.clock().astimezone(UTC).isoformat(),
            }
        )

        if self.kill_switch:
            logger.info("kill-switch engaged: skipping execution for %s", proposal.proposal_id)
            return CycleResult(
                status="skipped",
                research_thread_id=research_thread,
                proposal_id=proposal.proposal_id,
                reason="kill-switch engaged",
            )

        exec_thread = f"exec:{proposal.proposal_id}"
        exec_state = {"proposal": proposal.model_dump(mode="json"), "now_ms": now_ms}
        final_exec = capture_stream(self.execution_graph, exec_thread, exec_state, self.store) or {}
        self.store.append_run(
            {
                "run_id": exec_thread,
                "kind": "execution",
                "thread_id": exec_thread,
                "proposal_id": proposal.proposal_id,
                "status": final_exec.get("status", "failed"),
                "reason": final_exec.get("reason", ""),
                "fill": final_exec.get("fill"),
                "account": final_exec.get("account"),
                "started_at": iso,
                "finished_at": self.clock().astimezone(UTC).isoformat(),
            }
        )
        return CycleResult(
            status="executed",
            research_thread_id=research_thread,
            proposal_id=proposal.proposal_id,
            execution_run_id=exec_thread,
            reason=final_exec.get("reason", ""),
        )

    def _extract_proposal(
        self, final: dict | None, research_thread: str
    ) -> StrategyProposal | None:
        if not final or "structured_response" not in final:
            self.store.append_stream_event(
                research_thread, {"type": "error", "reason": "no output"}
            )
            return None
        raw = final["structured_response"]
        try:
            if isinstance(raw, StrategyProposal):
                return raw
            return StrategyProposal.model_validate(raw)
        except Exception as exc:  # noqa: BLE001 - invalid output is a research failure
            logger.warning("research produced an invalid proposal: %s", exc)
            return None

    # -- lifecycle ---------------------------------------------------------
    def start(self) -> Any | None:
        """Start the APScheduler interval loop (no-op when disabled)."""
        if not self.settings.agent_enabled:
            logger.info("agent runtime disabled (MD_AGENT_ENABLED=false)")
            return None
        if self._scheduler is not None:
            return self._scheduler
        from apscheduler.schedulers.background import BackgroundScheduler

        self.build()
        scheduler = BackgroundScheduler()
        scheduler.add_job(
            self.run_once,
            "interval",
            seconds=max(1, self.settings.agent_loop_seconds),
            max_instances=1,
            coalesce=True,
            id="agent_loop",
        )
        scheduler.start()
        self._scheduler = scheduler
        logger.info("agent worker started (every %ss)", self.settings.agent_loop_seconds)
        return scheduler

    def stop(self) -> None:
        if self._scheduler is not None:
            self._scheduler.shutdown(wait=False)
            self._scheduler = None
        if self._conn is not None:
            try:
                self._conn.close()
            finally:
                self._conn = None
