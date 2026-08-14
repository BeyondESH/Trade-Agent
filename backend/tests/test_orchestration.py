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
    run_retrain,
)
from market_data.risk import Portfolio
from market_data.store import ParquetStore

BASE = 1_700_000_000_000
STEP = 300_000


def _df_near_support(n=120) -> pd.DataFrame:
    # Oscillating series so build_levels yields strong support just below price,
    # with the last close sitting right on a repeated low.
    closes = [100 + 5 * np.sin(i / 4) for i in range(n)]
    closes[-1] = min(closes) + 0.01  # park price at the support
    closes = np.array(closes, dtype="float64")
    return pd.DataFrame({
        "open_time": [BASE + i * STEP for i in range(n)],
        "open": closes, "high": closes + 0.5, "low": closes - 0.5,
        "close": closes, "volume": [1.0] * n,
    })


def _cycle(tmp, equity=1000.0, run_control=None):  # noqa: ANN001
    journal = TradeJournal(Path(tmp) / "trades.jsonl")
    return AgentCycle(
        engine=ExecutionEngine(portfolio=Portfolio(equity=equity)),
        memory_store=MemoryStore(journal),
        reflector=Reflector(),
        journal=journal,
        run_control=run_control or RunControl(),
        cfg=ProviderConfig(near_pct=0.01, min_strength=2),
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
            "ETHUSDT", "long", 50.0, 5000.0, 1.0, 100)  # full margin
        df = _df_near_support()
        res = cycle.step(df, "BTCUSDT", "5m", float(df["close"].iloc[-1]))
        assert not res.get("filled")
        assert "BTCUSDT" not in cycle.engine.portfolio.positions


# -- 5.5 orchestrator jobs -------------------------------------------------
def test_build_orchestrator_registers_jobs() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, _ = _cycle(tmp)
        settings = types.SimpleNamespace(
            symbols=["BTCUSDT"], timeframes=["5m"], category="USDT-FUTURES",
            schedule_interval_seconds=300)
        sched = build_orchestrator(cycle, lambda: None, ParquetStore(Path(tmp)),
                                   settings, cycle.run_control)
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
            symbols=["BTCUSDT"], timeframes=["5m"], category="USDT-FUTURES")
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
            symbols=["BTCUSDT"], timeframes=["5m"], category="USDT-FUTURES",
            schedule_interval_seconds=300)
        sched = build_orchestrator(cycle, lambda: None, store, settings, cycle.run_control)
        sched.get_job("agent_cycle").func()  # kill-switch on -> should skip trading
        assert cycle.engine.portfolio.positions == {}


def test_jobs_isolate_failures() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        cycle, _ = _cycle(tmp)
        store = ParquetStore(Path(tmp))
        settings = types.SimpleNamespace(
            symbols=["BTCUSDT"], timeframes=["5m"], category="USDT-FUTURES",
            schedule_interval_seconds=300)

        def boom():
            raise RuntimeError("pull failed")

        sched = build_orchestrator(cycle, boom, store, settings, cycle.run_control)
        # A failing data_pull must be swallowed by the job wrapper (no raise).
        sched.get_job("data_pull").func()


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All orchestration tests passed.")


if __name__ == "__main__":
    _run_all()
