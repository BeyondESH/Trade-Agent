"""Unit tests for the deterministic execution graph (execution-graph capability)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from langgraph.checkpoint.memory import MemorySaver

from market_data.agent.broker import PaperBroker, Side
from market_data.agent.execution import (
    EXECUTION_NODES,
    Quote,
    RiskLimits,
    build_execution_graph,
    plan_position,
)
from market_data.events import EventLog

T0 = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
NOW_MS = int(T0.timestamp() * 1000)

SUCCESS_PATH = [
    "ingest_intent",
    "resolve_market",
    "pre_trade_checks",
    "risk_gate",
    "size_position",
    "build_order",
    "submit",
    "reconcile",
    "audit",
]


def _limits(**overrides: float) -> RiskLimits:
    base: dict = {
        "max_leverage": 3.0,
        "max_symbol_notional": 1000.0,
        "max_portfolio_notional": 3000.0,
        "max_drawdown": 0.2,
        "risk_fraction": 0.01,
    }
    base.update(overrides)
    return RiskLimits(**base)


def _resolver(prices: dict[str, float], ts: int = NOW_MS):
    def resolve(symbol: str, category: str) -> Quote | None:
        price = prices.get(symbol)
        return None if price is None else Quote(symbol=symbol, price=price, ts=ts)

    return resolve


def _proposal(**overrides: object) -> dict:
    data: dict = {
        "proposal_id": "p-1",
        "produced_at": T0.isoformat(),
        "expires_at": (T0 + timedelta(minutes=5)).isoformat(),
        "symbol": "BTCUSDT",
        "category": "USDT-FUTURES",
        "timeframe": "1h",
        "action": "open_long",
        "entry": {"kind": "market"},
        "stop_loss": 99.0,
        "confidence": 0.6,
        "horizon": "1d",
        "rationale": "momentum",
        "evidence": [{"source": "news"}],
        "provenance": {"model": "m", "prompt_ver": "v1", "research_thread_id": "research:1"},
    }
    data.update(overrides)
    return data


def _graph(
    broker: PaperBroker,
    prices: dict[str, float],
    limits: RiskLimits,
    *,
    ts: int = NOW_MS,
    events: EventLog | None = None,
    kill_switch: bool = False,
):
    return build_execution_graph(
        broker=broker,
        market=_resolver(prices, ts=ts),
        limits=limits,
        events=events,
        kill_switch=kill_switch,
    )


# -- sizing ----------------------------------------------------------------
def test_plan_position_scales_with_stop_distance() -> None:
    plan = plan_position(equity=1000.0, price=100.0, stop_loss=99.0, risk_fraction=0.01)
    assert plan.risk_amount == pytest.approx(10.0)
    assert plan.qty == pytest.approx(10.0)
    assert plan.notional == pytest.approx(1000.0)
    assert plan.leverage == pytest.approx(1.0)
    wider = plan_position(equity=1000.0, price=100.0, stop_loss=90.0, risk_fraction=0.01)
    assert wider.qty == pytest.approx(1.0)


def test_plan_position_without_stop_uses_risk_amount_as_notional() -> None:
    plan = plan_position(equity=1000.0, price=100.0, stop_loss=None, risk_fraction=0.01)
    assert plan.notional == pytest.approx(10.0)
    assert plan.stop_distance is None


def test_plan_position_zero_equity_is_empty() -> None:
    plan = plan_position(equity=0.0, price=100.0, stop_loss=99.0, risk_fraction=0.01)
    assert plan.qty == 0.0


# -- happy paths -----------------------------------------------------------
def test_compiled_graph_nodes_match_whitelist() -> None:
    broker = PaperBroker(1000.0, 0.2)
    graph = _graph(broker, {"BTCUSDT": 100.0}, _limits())
    assert set(graph.nodes) - {"__start__"} == set(EXECUTION_NODES)


def test_open_long_walks_the_success_path() -> None:
    broker = PaperBroker(1000.0, 0.2)
    graph = _graph(broker, {"BTCUSDT": 100.0}, _limits())
    out = graph.invoke({"proposal": _proposal(), "now_ms": NOW_MS})
    assert out["status"] == "ok" and out.get("failed") is not True
    assert [a["node"] for a in out["audit"]] == SUCCESS_PATH
    position = broker.position("BTCUSDT")
    assert position is not None and position.side is Side.LONG
    assert out["qty"] == pytest.approx(10.0)
    assert out["fill"]["kind"] == "open"


def test_close_flattens_existing_position() -> None:
    broker = PaperBroker(1000.0, 0.2)
    broker.open(
        idempotency_key="seed",
        symbol="BTCUSDT",
        side=Side.LONG,
        qty=5.0,
        price=90.0,
        ts=NOW_MS - 1000,
    )
    graph = _graph(broker, {"BTCUSDT": 100.0}, _limits())
    out = graph.invoke({"proposal": _proposal(action="close"), "now_ms": NOW_MS})
    assert out["status"] == "ok"
    assert broker.position("BTCUSDT") is None
    assert out["fill"]["realized_pnl"] == pytest.approx(50.0)


def test_limit_entry_fills_at_limit_price() -> None:
    broker = PaperBroker(1000.0, 0.2)
    graph = _graph(broker, {"BTCUSDT": 100.0}, _limits())
    out = graph.invoke(
        {
            "proposal": _proposal(entry={"kind": "limit", "price": 101.0}),
            "now_ms": NOW_MS,
        }
    )
    assert out["status"] == "ok"
    assert out["fill"]["price"] == pytest.approx(101.0)
    position = broker.position("BTCUSDT")
    assert position is not None and position.entry_price == pytest.approx(101.0)


def test_proposal_size_and_leverage_are_ignored() -> None:
    broker = PaperBroker(1000.0, 0.2)
    graph = _graph(broker, {"BTCUSDT": 100.0}, _limits())
    out = graph.invoke(
        {
            "proposal": _proposal(suggested_qty=9999.0, suggested_leverage=100.0),
            "now_ms": NOW_MS,
        }
    )
    assert out["qty"] == pytest.approx(10.0)
    position = broker.position("BTCUSDT")
    assert position is not None and position.qty == pytest.approx(10.0)


def test_same_inputs_are_deterministic() -> None:
    first = PaperBroker(1000.0, 0.2)
    second = PaperBroker(1000.0, 0.2)
    state = {"proposal": _proposal(), "now_ms": NOW_MS}
    out_a = _graph(first, {"BTCUSDT": 100.0}, _limits()).invoke(state)
    out_b = _graph(second, {"BTCUSDT": 100.0}, _limits()).invoke(state)
    assert out_a["qty"] == out_b["qty"]
    assert out_a["order"] == out_b["order"]


# -- fail-closed paths -----------------------------------------------------
def _assert_failed(graph, state: dict, broker: PaperBroker, symbol: str = "BTCUSDT") -> dict:
    out = graph.invoke(state)
    assert out["status"] == "failed"
    assert out["failed"] is True
    assert out["audit"][-1]["node"] == "fail_closed"
    assert broker.position(symbol) is None
    return out


def test_expired_proposal_fails_closed() -> None:
    broker = PaperBroker(1000.0, 0.2)
    graph = _graph(broker, {"BTCUSDT": 100.0}, _limits())
    state = {"proposal": _proposal(), "now_ms": NOW_MS + 10 * 60 * 1000}
    out = _assert_failed(graph, state, broker)
    assert "expired" in out["reason"]


def test_untradable_symbol_fails_closed() -> None:
    broker = PaperBroker(1000.0, 0.2)
    graph = _graph(broker, {}, _limits())
    out = _assert_failed(graph, {"proposal": _proposal(), "now_ms": NOW_MS}, broker)
    assert "no tradable quote" in out["reason"]


def test_stale_quote_fails_closed() -> None:
    broker = PaperBroker(1000.0, 0.2)
    graph = _graph(broker, {"BTCUSDT": 100.0}, _limits(), ts=NOW_MS - 120_000)
    out = _assert_failed(graph, {"proposal": _proposal(), "now_ms": NOW_MS}, broker)
    assert "stale quote" in out["reason"]


def test_kill_switch_fails_closed() -> None:
    broker = PaperBroker(1000.0, 0.2)
    graph = _graph(broker, {"BTCUSDT": 100.0}, _limits(), kill_switch=True)
    out = _assert_failed(graph, {"proposal": _proposal(), "now_ms": NOW_MS}, broker)
    assert "kill-switch" in out["reason"]


def test_circuit_breaker_fails_closed() -> None:
    broker = PaperBroker(1000.0, 0.1)
    broker.open(
        idempotency_key="seed", symbol="BTCUSDT", side=Side.LONG, qty=2.0, price=100.0, ts=1
    )
    broker.mark("BTCUSDT", 40.0, ts=2)
    assert broker.circuit_breaker is True
    graph = _graph(broker, {"ETHUSDT": 100.0}, _limits(max_drawdown=0.1))
    out = _assert_failed(
        graph, {"proposal": _proposal(symbol="ETHUSDT"), "now_ms": NOW_MS}, broker, "ETHUSDT"
    )
    assert "circuit breaker" in out["reason"]


def test_leverage_limit_fails_closed() -> None:
    broker = PaperBroker(1000.0, 0.2)
    graph = _graph(broker, {"BTCUSDT": 100.0}, _limits(max_leverage=1.0, risk_fraction=0.5))
    out = _assert_failed(graph, {"proposal": _proposal(), "now_ms": NOW_MS}, broker)
    assert "leverage" in out["reason"]


def test_symbol_notional_limit_fails_closed() -> None:
    broker = PaperBroker(1000.0, 0.2)
    graph = _graph(
        broker,
        {"BTCUSDT": 100.0},
        _limits(max_leverage=1e9, max_symbol_notional=100.0, risk_fraction=0.5),
    )
    out = _assert_failed(graph, {"proposal": _proposal(), "now_ms": NOW_MS}, broker)
    assert "symbol notional" in out["reason"]


def test_portfolio_notional_limit_fails_closed() -> None:
    broker = PaperBroker(1000.0, 0.2)
    broker.open(
        idempotency_key="seed", symbol="ETHUSDT", side=Side.LONG, qty=9.0, price=100.0, ts=1
    )
    graph = _graph(
        broker,
        {"BTCUSDT": 100.0},
        _limits(
            max_leverage=1e9,
            max_symbol_notional=1e9,
            max_portfolio_notional=1000.0,
            risk_fraction=0.5,
        ),
    )
    out = _assert_failed(graph, {"proposal": _proposal(), "now_ms": NOW_MS}, broker)
    assert "portfolio notional" in out["reason"]


def test_entry_with_existing_position_fails_closed() -> None:
    broker = PaperBroker(1000.0, 0.2)
    broker.open(
        idempotency_key="seed", symbol="BTCUSDT", side=Side.LONG, qty=1.0, price=100.0, ts=1
    )
    graph = _graph(broker, {"BTCUSDT": 100.0}, _limits())
    out = graph.invoke({"proposal": _proposal(), "now_ms": NOW_MS})
    assert out["status"] == "failed"
    assert out["audit"][-1]["node"] == "fail_closed"
    assert "already open" in out["reason"]
    assert len(broker.fills) == 1  # only the seed; no second order
    position = broker.position("BTCUSDT")
    assert position is not None and position.qty == pytest.approx(1.0)


def test_close_without_position_fails_closed() -> None:
    broker = PaperBroker(1000.0, 0.2)
    graph = _graph(broker, {"BTCUSDT": 100.0}, _limits())
    out = _assert_failed(graph, {"proposal": _proposal(action="close"), "now_ms": NOW_MS}, broker)
    assert "no open position" in out["reason"]


def test_invalid_schema_fails_closed() -> None:
    broker = PaperBroker(1000.0, 0.2)
    graph = _graph(broker, {"BTCUSDT": 100.0}, _limits())
    state = {"proposal": _proposal(confidence=1.5), "now_ms": NOW_MS}
    out = _assert_failed(graph, state, broker)
    assert "schema invalid" in out["reason"]


# -- idempotency / resume --------------------------------------------------
def test_resume_same_thread_does_not_duplicate_order() -> None:
    broker = PaperBroker(1000.0, 0.2)
    graph = build_execution_graph(
        broker=broker,
        market=_resolver({"BTCUSDT": 100.0}),
        limits=_limits(),
        checkpointer=MemorySaver(),
    )
    config = {"configurable": {"thread_id": "exec:p-1"}}
    state = {"proposal": _proposal(), "now_ms": NOW_MS}
    graph.invoke(state, config)
    graph.invoke(state, config)
    assert len(broker.fills) == 1
    assert len(broker.positions) == 1


def test_same_proposal_on_new_thread_does_not_duplicate_order() -> None:
    broker = PaperBroker(1000.0, 0.2)
    graph = _graph(broker, {"BTCUSDT": 100.0}, _limits())
    state = {"proposal": _proposal(), "now_ms": NOW_MS}
    graph.invoke(state, {"configurable": {"thread_id": "t1"}})
    second = graph.invoke(state, {"configurable": {"thread_id": "t2"}})
    assert len(broker.fills) == 1
    assert second["failed"] is True  # existing position blocks the re-entry


def test_audit_events_are_written_to_jsonl(pg_db) -> None:  # noqa: ANN001
    broker = PaperBroker(1000.0, 0.2)
    events = EventLog(pg_db)
    graph = _graph(broker, {"BTCUSDT": 100.0}, _limits(), events=events)
    graph.invoke({"proposal": _proposal(), "now_ms": NOW_MS})
    steps = events.list(kind="execution_step")
    assert [e["payload"]["node"] for e in steps] == SUCCESS_PATH


def test_failed_run_is_audited(pg_db) -> None:  # noqa: ANN001
    broker = PaperBroker(1000.0, 0.2)
    events = EventLog(pg_db)
    graph = _graph(broker, {}, _limits(), events=events)
    graph.invoke({"proposal": _proposal(), "now_ms": NOW_MS})
    nodes = [e["payload"]["node"] for e in events.list(kind="execution_step")]
    assert nodes[-1] == "fail_closed"
    assert "audit" not in nodes
