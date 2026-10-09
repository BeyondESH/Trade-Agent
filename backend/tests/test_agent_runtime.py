"""Runtime loop tests: single-instance, kill-switch, failure isolation."""

from __future__ import annotations

import threading
from datetime import UTC, datetime
from pathlib import Path

from agent_fakes import (
    ScriptedChatModel,
    fake_tools,
    make_proposal,
    proposal_message,
    proposal_model,
    seeded_store,
)
from langgraph.checkpoint.memory import MemorySaver

from market_data.agent.execution import Quote
from market_data.agent.runtime import AgentRuntime
from market_data.agent.store import ProjectionStore
from market_data.config import Settings

T0 = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
NOW_MS = int(T0.timestamp() * 1000)

GATE = threading.Event()
ENTERED = threading.Event()


class GatedModel(ScriptedChatModel):
    """Blocks inside generation so a second `run_once` overlaps the first."""

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):  # noqa: ANN001
        ENTERED.set()
        GATE.wait(timeout=5)
        return super()._generate(messages, stop, run_manager, **kwargs)


class RaisingModel(ScriptedChatModel):
    def _generate(self, messages, stop=None, run_manager=None, **kwargs):  # noqa: ANN001
        raise RuntimeError("model boom")


def _settings(tmp_path: Path, **overrides: object) -> Settings:
    base: dict = {
        "data_dir": tmp_path,
        "symbols": ["BTCUSDT"],
        "timeframes": ["1h"],
        "agent_paper_equity": 1000.0,
        "agent_max_drawdown": 0.2,
    }
    base.update(overrides)
    return Settings(**base)


def _runtime(tmp_path: Path, model, database=None, **kwargs) -> AgentRuntime:  # noqa: ANN001
    settings = kwargs.pop("settings", None) or _settings(tmp_path)
    tools = kwargs.pop("tools", None) or fake_tools(settings, store=seeded_store(database))
    market = kwargs.pop(
        "market", lambda symbol, category: Quote(symbol=symbol, price=100.0, ts=NOW_MS)
    )
    store = kwargs.pop("store", None)
    if store is None and database is not None:
        store = ProjectionStore(database)
    return AgentRuntime(
        settings,
        store=store,
        model=model,
        tools=tools,
        market=market,
        clock=lambda: T0,
        # Unit tests must not require a live Postgres: inject the same
        # in-memory saver the execution tests use. Production builds the
        # Postgres saver from `settings.postgres_dsn`.
        checkpointer=MemorySaver(),
        **kwargs,
    )


def _stop(runtime: AgentRuntime) -> None:
    runtime.stop()


def test_happy_path_research_then_execution(tmp_path: Path, pg_db) -> None:  # noqa: ANN001
    runtime = _runtime(tmp_path, proposal_model(make_proposal(proposal_id="p-1")), pg_db)
    try:
        result = runtime.run_once()
        assert result.status == "executed"
        assert result.proposal_id == "p-1"
        assert runtime.store.get_proposal("p-1") is not None

        kinds = {run["kind"]: run for run in runtime.store.list_runs()}
        assert kinds["research"]["status"] == "ok"
        assert kinds["execution"]["status"] == "ok"
        assert runtime.broker.position("BTCUSDT") is not None
    finally:
        _stop(runtime)


def test_kill_switch_blocks_execution_but_not_research(tmp_path: Path, pg_db) -> None:  # noqa: ANN001
    runtime = _runtime(
        tmp_path, proposal_model(make_proposal(proposal_id="p-kill")), pg_db, kill_switch=True
    )
    try:
        result = runtime.run_once()
        assert result.status == "skipped"
        assert result.proposal_id == "p-kill"
        assert runtime.store.get_proposal("p-kill") is not None  # research still ran
        assert runtime.store.list_runs(kind="execution") == []
        assert runtime.broker.position("BTCUSDT") is None
    finally:
        _stop(runtime)


def test_loop_is_single_instance(tmp_path: Path, pg_db) -> None:  # noqa: ANN001
    GATE.clear()
    ENTERED.clear()
    model = GatedModel(responses=[proposal_message(make_proposal(proposal_id="p-lock"))])
    runtime = _runtime(tmp_path, model, pg_db)
    results: list = []

    def _first() -> None:
        results.append(runtime.run_once())

    worker = threading.Thread(target=_first)
    try:
        worker.start()
        assert ENTERED.wait(timeout=5), "first cycle never reached the model"

        second = runtime.run_once()  # overlaps the blocked first cycle
        assert second.status == "skipped"
        assert "still running" in second.reason

        GATE.set()
        worker.join(timeout=10)
        assert not worker.is_alive()
        assert results and results[0].status == "executed"
    finally:
        GATE.set()
        _stop(runtime)


def test_research_failure_does_not_produce_execution(tmp_path: Path, pg_db) -> None:  # noqa: ANN001
    runtime = _runtime(tmp_path, RaisingModel(responses=[]), pg_db)
    try:
        result = runtime.run_once()
        assert result.status == "no_proposal"
        assert runtime.store.list_runs(kind="execution") == []
        assert runtime.store.list_proposals() == []
        research = runtime.store.list_runs(kind="research")
        assert research and research[0]["status"] == "failed"
        # The deterministic execution graph is untouched and still assembled.
        assert runtime.execution_graph is not None
    finally:
        _stop(runtime)


def test_start_is_disabled_when_agent_disabled(tmp_path: Path, pg_db) -> None:  # noqa: ANN001
    runtime = _runtime(
        tmp_path, proposal_model(), pg_db, settings=_settings(tmp_path, agent_enabled=False)
    )
    try:
        assert runtime.start() is None
        assert runtime.research_graph is None
    finally:
        _stop(runtime)


def test_invalid_structured_output_is_a_research_failure(tmp_path: Path, pg_db) -> None:  # noqa: ANN001
    bad = make_proposal(proposal_id="bad")
    message = proposal_message(bad)
    message.tool_calls[0]["args"]["confidence"] = 1.5  # violates the contract
    model = ScriptedChatModel(responses=[message])
    runtime = _runtime(tmp_path, model, pg_db)
    try:
        result = runtime.run_once()
        assert result.status == "no_proposal"
        assert runtime.store.list_runs(kind="execution") == []
    finally:
        _stop(runtime)
