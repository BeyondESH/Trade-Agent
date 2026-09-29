"""Unit tests for the deterministic paper broker (paper-broker capability)."""

from __future__ import annotations

import pytest

from market_data.agent.broker import (
    BrokerRejected,
    CircuitBreakerTripped,
    PaperBroker,
    Side,
)


def _broker(equity: float = 1000.0, max_drawdown: float = 0.2) -> PaperBroker:
    return PaperBroker(initial_equity=equity, max_drawdown=max_drawdown)


def test_open_creates_position_and_equity_curve() -> None:
    broker = _broker()
    fill = broker.open(
        idempotency_key="k1", symbol="BTCUSDT", side=Side.LONG, qty=2.0, price=100.0, ts=1
    )
    assert fill.kind == "open" and fill.realized_pnl == 0.0
    position = broker.position("BTCUSDT")
    assert position is not None and position.qty == 2.0
    assert broker.equity == 1000.0
    assert len(broker.equity_curve) == 2  # initial seed + open


def test_close_settles_realized_pnl_and_flattens() -> None:
    broker = _broker()
    broker.open(idempotency_key="k1", symbol="BTCUSDT", side=Side.LONG, qty=2.0, price=100.0, ts=1)
    fill = broker.close(idempotency_key="k2", symbol="BTCUSDT", price=120.0, ts=2)
    assert fill.realized_pnl == pytest.approx(40.0)
    assert broker.position("BTCUSDT") is None
    assert broker.realized_pnl == pytest.approx(40.0)
    assert broker.equity == pytest.approx(1040.0)


def test_short_close_pnl_direction() -> None:
    broker = _broker()
    broker.open(idempotency_key="k1", symbol="ETHUSDT", side=Side.SHORT, qty=5.0, price=200.0, ts=1)
    fill = broker.close(idempotency_key="k2", symbol="ETHUSDT", price=180.0, ts=2)
    assert fill.realized_pnl == pytest.approx(100.0)
    assert broker.equity == pytest.approx(1100.0)


def test_mark_updates_unrealized_and_equity_curve() -> None:
    broker = _broker()
    broker.open(idempotency_key="k1", symbol="BTCUSDT", side=Side.LONG, qty=10.0, price=100.0, ts=1)
    broker.mark("BTCUSDT", 110.0, ts=2)
    assert broker.unrealized_pnl == pytest.approx(100.0)
    assert broker.equity == pytest.approx(1100.0)
    assert broker.equity_curve[-1].equity == pytest.approx(1100.0)


def test_drawdown_latches_circuit_breaker_and_blocks_open() -> None:
    broker = _broker(max_drawdown=0.1)
    broker.open(idempotency_key="k1", symbol="BTCUSDT", side=Side.LONG, qty=2.0, price=100.0, ts=1)
    broker.mark("BTCUSDT", 40.0, ts=2)  # equity 880 -> 12% drawdown
    assert broker.circuit_breaker is True
    assert broker.drawdown > 0.1
    with pytest.raises(CircuitBreakerTripped):
        broker.open(
            idempotency_key="k2", symbol="ETHUSDT", side=Side.LONG, qty=1.0, price=10.0, ts=3
        )


def test_close_still_allowed_after_breaker() -> None:
    broker = _broker(max_drawdown=0.1)
    broker.open(idempotency_key="k1", symbol="BTCUSDT", side=Side.LONG, qty=2.0, price=100.0, ts=1)
    broker.mark("BTCUSDT", 40.0, ts=2)
    assert broker.circuit_breaker is True
    fill = broker.close(idempotency_key="k2", symbol="BTCUSDT", price=40.0, ts=3)
    assert fill.realized_pnl == pytest.approx(-120.0)
    assert broker.position("BTCUSDT") is None


def test_idempotent_open_and_close_return_same_fill() -> None:
    broker = _broker()
    first = broker.open(
        idempotency_key="k1", symbol="BTCUSDT", side=Side.LONG, qty=1.0, price=100.0, ts=1
    )
    again = broker.open(
        idempotency_key="k1", symbol="BTCUSDT", side=Side.LONG, qty=1.0, price=100.0, ts=1
    )
    assert first is again
    assert len(broker.fills) == 1
    close = broker.close(idempotency_key="k2", symbol="BTCUSDT", price=110.0, ts=2)
    assert broker.close(idempotency_key="k2", symbol="BTCUSDT", price=110.0, ts=2) is close
    assert len(broker.fills) == 2


def test_rejects_duplicate_symbol_and_bad_size() -> None:
    broker = _broker()
    broker.open(idempotency_key="k1", symbol="BTCUSDT", side=Side.LONG, qty=1.0, price=100.0, ts=1)
    with pytest.raises(BrokerRejected):
        broker.open(
            idempotency_key="k2", symbol="BTCUSDT", side=Side.SHORT, qty=1.0, price=100.0, ts=2
        )
    with pytest.raises(BrokerRejected):
        broker.open(
            idempotency_key="k3", symbol="ETHUSDT", side=Side.LONG, qty=0.0, price=10.0, ts=3
        )
    with pytest.raises(BrokerRejected):
        broker.close(idempotency_key="k4", symbol="SOLUSDT", price=10.0, ts=4)


def test_portfolio_notional_and_snapshot() -> None:
    broker = _broker()
    broker.open(idempotency_key="k1", symbol="BTCUSDT", side=Side.LONG, qty=2.0, price=100.0, ts=1)
    broker.open(idempotency_key="k2", symbol="ETHUSDT", side=Side.SHORT, qty=3.0, price=200.0, ts=2)
    assert broker.portfolio_notional() == pytest.approx(800.0)
    snapshot = broker.snapshot()
    assert set(snapshot["positions"]) == {"BTCUSDT", "ETHUSDT"}
    assert snapshot["circuit_breaker"] is False


def test_invalid_construction() -> None:
    with pytest.raises(ValueError):
        PaperBroker(initial_equity=0.0, max_drawdown=0.2)
    with pytest.raises(ValueError):
        PaperBroker(initial_equity=1000.0, max_drawdown=1.0)


def test_fill_for_lookup() -> None:
    broker = _broker()
    assert broker.fill_for("missing") is None
    broker.open(idempotency_key="k1", symbol="BTCUSDT", side=Side.LONG, qty=1.0, price=100.0, ts=1)
    assert broker.fill_for("k1") is not None
