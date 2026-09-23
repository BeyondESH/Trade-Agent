"""Offline tests for automation & orchestration (closes the #6 memory loop).

Run:
    python tests/test_orchestration.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import tempfile
import types
from pathlib import Path

import numpy as np
import pandas as pd

from market_data.execution import ExecutionEngine
from market_data.llm import ProviderConfig
from market_data.memory import MemoryStore, Reflector, TradeJournal
from market_data.orchestration import (
    AgentCycle,
    RunControl,
    build_orchestrator,
    run_circuit_breaker,
    run_retrain,
)
from market_data.risk import Portfolio, Position
from market_data.store import ParquetStore

BASE = 1_700_000_000_000
STEP = 300_000


def _df_near_support(n=120) -> pd.DataFrame:
    # Oscillating series so build_levels yields strong support just below price,
    # with the last close sitting right on a repeated low.
    closes = [100 + 5 * np.sin(i / 4) for i in range(n)]
    closes[-1] = min(closes) + 0.01  # park price at the support
    closes = np.array(closes, dtype="float64")
    return pd.DataFrame(
        {
            "open_time": [BASE + i * STEP for i in range(n)],
            "open": closes,
            "high": closes + 0.5,
            "low": closes - 0.5,
            "close": closes,
            "volume": [1.0] * n,
        }
    )


def _cycle(tmp, equity=1000.0, run_control=None, news_provider=None, complete=None):  # noqa: ANN001
    journal = TradeJournal(Path(tmp) / "trades.jsonl")
    return AgentCycle(
        engine=ExecutionEngine(portfolio=Portfolio(equity=equity)),
        memory_store=MemoryStore(journal),
        reflector=Reflector(),
        journal=journal,
        run_control=run_control or RunControl(),
        cfg=ProviderConfig(near_pct=0.01, min_strength=2),
        news_provider=news_provider,
        complete=complete,
    ), journal


# -- 5.1 / 5.3 memory loop + journaling -----------------------------------
def test_memory_loop_close_and_retrieve() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, journal = _cycle(tmp)
        df = _df_near_support()
        price = float(df["close"].iloc[-1])
        opened = cycle.step(df, "BTCUSDT", "5m", price)
        assert opened["status"] == "open" and opened["filled"]
        # close and verify a reflected, journaled trade is retrievable
        pnl = cycle.close_position("BTCUSDT", price * 1.01, "take profit")
        assert pnl is not None
        closed = journal.closed()
        assert len(closed) == 1 and closed[0].reflection
        got = cycle.memory_store.retrieve(closed[0].features, k=1)
        assert got and got[0].id == closed[0].id


# -- 5.2 memory injection into context ------------------------------------
def test_context_augmented_with_memories_rules() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, _ = _cycle(tmp)
        df = _df_near_support()
        _decision, aug, _feats, _n = cycle.decide(df, "BTCUSDT", "5m")
        assert "memories" in aug and "rules" in aug


# -- news injection (agent-context-news-injection) -------------------------
def test_news_provider_injected_into_context() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, _ = _cycle(tmp, news_provider=lambda: "NEWS")
        df = _df_near_support()
        _decision, aug, _feats, _n = cycle.decide(df, "BTCUSDT", "5m")
        assert aug["news"] == "NEWS"


def test_explicit_news_overrides_provider() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, _ = _cycle(tmp, news_provider=lambda: "NEWS")
        df = _df_near_support()
        _decision, aug, _feats, _n = cycle.decide(df, "BTCUSDT", "5m", news="EXPLICIT")
        assert aug["news"] == "EXPLICIT"


def _open_and_close(cycle) -> None:  # noqa: ANN001
    df = _df_near_support()
    price = float(df["close"].iloc[-1])
    cycle.step(df, "BTCUSDT", "5m", price)
    cycle.close_position("BTCUSDT", price * 1.01, "take profit")


def test_complete_injected_drives_reflection() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, journal = _cycle(tmp, complete=lambda system, user: "LLM reflection")
        _open_and_close(cycle)
        closed = journal.closed()
        assert closed and closed[0].reflection == "LLM reflection"


def test_complete_none_falls_back_to_heuristic() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, journal = _cycle(tmp)  # complete defaults to None
        _open_and_close(cycle)
        closed = journal.closed()
        assert closed and "pnl=" in closed[0].reflection


# -- 5.3 run control -------------------------------------------------------
def test_kill_switch_halts() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, _ = _cycle(tmp, run_control=RunControl(kill_switch=True))
        df = _df_near_support()
        res = cycle.step(df, "BTCUSDT", "5m", float(df["close"].iloc[-1]))
        assert res["status"] == "halted"
        assert "BTCUSDT" not in cycle.engine.portfolio.positions


def test_default_paper_only() -> None:
    assert RunControl().paper_only is True and RunControl().can_trade() is True


# -- 5.4 open goes through risk gate --------------------------------------
def test_open_blocked_by_full_portfolio() -> None:
    from market_data.risk import Position

    with tempfile.TemporaryDirectory() as tmp:
        cycle, _ = _cycle(tmp)
        cycle.engine.portfolio.positions["ETHUSDT"] = Position(
            "ETHUSDT", "long", 50.0, 5000.0, 1.0, 100
        )  # full margin
        df = _df_near_support()
        res = cycle.step(df, "BTCUSDT", "5m", float(df["close"].iloc[-1]))
        assert not res.get("filled")
        assert "BTCUSDT" not in cycle.engine.portfolio.positions


# -- 5.5 orchestrator jobs -------------------------------------------------
def test_build_orchestrator_registers_jobs() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, _ = _cycle(tmp)
        settings = types.SimpleNamespace(
            symbols=["BTCUSDT"],
            timeframes=["5m"],
            category="USDT-FUTURES",
            schedule_interval_seconds=300,
        )
        sched = build_orchestrator(
            cycle,
            lambda: None,
            store=ParquetStore(Path(tmp)),
            settings=settings,
            run_control=cycle.run_control,
        )
        ids = {j.id for j in sched.get_jobs()}
        assert {"data_pull", "agent_cycle", "retrain"} <= ids


# -- 5.6 retrain job -------------------------------------------------------
def test_run_retrain_no_crash() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = ParquetStore(Path(tmp))
        series_dir = Path(tmp) / "USDT-FUTURES" / "BTCUSDT" / "5m"
        series_dir.mkdir(parents=True)
        _df_near_support(300).to_parquet(series_dir / "2023-11-14.parquet", index=False)
        settings = types.SimpleNamespace(
            symbols=["BTCUSDT"], timeframes=["5m"], category="USDT-FUTURES"
        )
        out = run_retrain(store, settings)
        assert out and "USDT-FUTURES/BTCUSDT/5m" in out[0]


def _store_with_data(tmp) -> ParquetStore:  # noqa: ANN001
    from market_data.models import Series

    store = ParquetStore(Path(tmp))
    store.save(Series("USDT-FUTURES", "BTCUSDT", "5m"), _df_near_support())
    return store


def test_agent_job_skips_on_kill_switch() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, _ = _cycle(tmp, run_control=RunControl(kill_switch=True))
        store = _store_with_data(tmp)
        settings = types.SimpleNamespace(
            symbols=["BTCUSDT"],
            timeframes=["5m"],
            category="USDT-FUTURES",
            schedule_interval_seconds=300,
        )
        sched = build_orchestrator(
            cycle, lambda: None, store=store, settings=settings, run_control=cycle.run_control
        )
        sched.get_job("agent_cycle").func()  # kill-switch on -> should skip trading
        assert cycle.engine.portfolio.positions == {}


def test_jobs_isolate_failures() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, _ = _cycle(tmp)
        store = ParquetStore(Path(tmp))
        settings = types.SimpleNamespace(
            symbols=["BTCUSDT"],
            timeframes=["5m"],
            category="USDT-FUTURES",
            schedule_interval_seconds=300,
        )

        def boom():
            raise RuntimeError("pull failed")

        sched = build_orchestrator(
            cycle, boom, store=store, settings=settings, run_control=cycle.run_control
        )
        # A failing data_pull must be swallowed by the job wrapper (no raise).
        sched.get_job("data_pull").func()


# -- wire-orchestration-runtime: conditional registration + breaker job ----
def _orch_settings(**over):  # noqa: ANN003
    base = {
        "symbols": ["BTCUSDT"],
        "timeframes": ["5m"],
        "category": "USDT-FUTURES",
        "schedule_interval_seconds": 300,
    }
    base.update(over)
    return types.SimpleNamespace(**base)


def test_orchestrator_breaker_only_when_agent_schedule_disabled() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, _ = _cycle(tmp)
        sched = build_orchestrator(
            cycle,
            None,
            store=ParquetStore(Path(tmp)),
            settings=_orch_settings(agent_schedule_enabled=False),
            run_control=cycle.run_control,
        )
        ids = {j.id for j in sched.get_jobs()}
        assert "circuit_breaker" in ids
        assert "agent_cycle" not in ids and "retrain" not in ids
        assert "data_pull" not in ids


def test_orchestrator_registers_agent_and_retrain_when_enabled() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, _ = _cycle(tmp)
        sched = build_orchestrator(
            cycle,
            None,
            store=ParquetStore(Path(tmp)),
            settings=_orch_settings(agent_schedule_enabled=True),
            run_control=cycle.run_control,
        )
        ids = {j.id for j in sched.get_jobs()}
        assert {"circuit_breaker", "agent_cycle", "retrain"} <= ids
        assert "data_pull" not in ids


def _tripped_cycle(tmp, symbols):  # noqa: ANN001
    cycle, journal = _cycle(tmp)
    p = cycle.engine.portfolio
    p.equity = 100.0
    p.peak_equity = 1000.0  # 90% drawdown >> 15% threshold
    for sym in symbols:
        p.positions[sym] = Position(sym, "long", 50.0, 5000.0, 100.0, 100)
    return cycle, journal


def test_run_circuit_breaker_closes_journals_and_is_idempotent() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, journal = _tripped_cycle(tmp, ["BTCUSDT"])
        store = _store_with_data(tmp)
        out = run_circuit_breaker(cycle, store, _orch_settings())
        assert len(out) == 1 and "BTCUSDT" in out[0]
        assert "BTCUSDT" not in cycle.engine.portfolio.positions
        closed = journal.closed()
        assert len(closed) == 1 and closed[0].reason == "circuit breaker"
        # idempotent: no positions remain -> a second run closes nothing.
        assert run_circuit_breaker(cycle, store, _orch_settings()) == []
        assert len(journal.closed()) == 1


def test_run_circuit_breaker_skips_missing_price_and_continues() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, journal = _tripped_cycle(tmp, ["BTCUSDT", "ETHUSDT"])
        store = _store_with_data(tmp)  # only BTCUSDT has readable prices
        out = run_circuit_breaker(cycle, store, _orch_settings())
        assert len(out) == 1 and "BTCUSDT" in out[0]
        assert "BTCUSDT" not in cycle.engine.portfolio.positions
        assert "ETHUSDT" in cycle.engine.portfolio.positions  # retried next cycle
        assert len(journal.closed()) == 1


def test_circuit_breaker_job_not_blocked_by_kill_switch() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, journal = _tripped_cycle(tmp, ["BTCUSDT"])
        cycle.run_control.kill_switch = True
        sched = build_orchestrator(
            cycle,
            None,
            store=_store_with_data(tmp),
            settings=_orch_settings(agent_schedule_enabled=False),
            run_control=cycle.run_control,
        )
        sched.get_job("circuit_breaker").func()
        assert "BTCUSDT" not in cycle.engine.portfolio.positions
        assert len(journal.closed()) == 1


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All orchestration tests passed.")


if __name__ == "__main__":
    _run_all()
