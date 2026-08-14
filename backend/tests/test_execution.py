"""Offline tests for the execution engine (paper + risk gate + live safety).

Run:
    python tests/test_execution.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

from market_data.execution import (
    ExecutionEngine,
    LiveBroker,
    OrderRequest,
    PaperBroker,
)
from market_data.risk import Portfolio, Position, RiskConfig, RiskEngine


def _order(symbol="BTCUSDT", side="long", lev=100.0, price=100.0) -> OrderRequest:
    return OrderRequest("USDT-FUTURES", symbol, side, lev, price)


# -- 6.1 paper open --------------------------------------------------------
def test_paper_open_records_position() -> None:
    eng = ExecutionEngine(portfolio=Portfolio(equity=1000.0))
    res = eng.place(_order(price=100.0), 100.0)
    assert res.approved and res.filled
    pos = eng.portfolio.positions["BTCUSDT"]
    assert pos.margin == 50.0 and pos.notional == 5000.0 and pos.adds == 1


# -- 6.2 paper close PnL ---------------------------------------------------
def test_paper_close_profit() -> None:
    eng = ExecutionEngine(portfolio=Portfolio(equity=1000.0))
    eng.place(_order(price=100.0), 100.0)  # notional 5000 @ 100
    pnl = eng.close("BTCUSDT", 101.0)  # +1% * 5000 = +50
    assert abs(pnl - 50.0) < 1e-9 and abs(eng.portfolio.equity - 1050.0) < 1e-9
    assert "BTCUSDT" not in eng.portfolio.positions


def test_paper_close_loss() -> None:
    eng = ExecutionEngine(portfolio=Portfolio(equity=1000.0))
    eng.place(_order(price=100.0), 100.0)
    pnl = eng.close("BTCUSDT", 99.0)  # -50
    assert pnl < 0 and eng.portfolio.equity < 1000.0


# -- 6.3 risk rejection blocks broker -------------------------------------
def test_risk_rejection_no_fill() -> None:
    pf = Portfolio(equity=1000.0)
    pf.positions["ETHUSDT"] = Position("ETHUSDT", "long", 50.0, 5000.0, 1.0, 100)  # full
    eng = ExecutionEngine(portfolio=pf)
    res = eng.place(_order(), 100.0)
    assert not res.approved and not res.filled
    assert "BTCUSDT" not in pf.positions  # broker never touched


def test_max_adds_blocks() -> None:
    pf = Portfolio(equity=1000.0)
    pf.positions["BTCUSDT"] = Position("BTCUSDT", "long", 10.0, 1000.0, 100.0, 100, adds=3)
    eng = ExecutionEngine(RiskEngine(RiskConfig(max_adds=3)), portfolio=pf)
    res = eng.place(_order(), 100.0)
    assert not res.filled and "adds" in res.reason


# -- 6.4 circuit breaker ---------------------------------------------------
def test_circuit_breaker_blocks_place() -> None:
    pf = Portfolio(equity=850.0, peak_equity=1000.0)  # 15% drawdown
    eng = ExecutionEngine(portfolio=pf)
    res = eng.place(_order(), 100.0)
    assert not res.filled and "circuit breaker" in res.reason


def test_enforce_returns_positions() -> None:
    pf = Portfolio(equity=850.0, peak_equity=1000.0)
    pf.positions["BTCUSDT"] = Position("BTCUSDT", "long", 50.0, 5000.0, 100.0, 100)
    eng = ExecutionEngine(portfolio=pf)
    to_close = eng.enforce_circuit_breaker()
    assert len(to_close) == 1 and to_close[0].symbol == "BTCUSDT"


# -- 6.5 live safety -------------------------------------------------------
class _FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def call_tool(self, name, arguments):  # noqa: ANN001
        self.calls.append((name, arguments))
        return {"ok": True}


def test_default_broker_is_paper() -> None:
    assert isinstance(ExecutionEngine().broker, PaperBroker)


def test_live_blocked_when_not_enabled() -> None:
    client = _FakeClient()
    broker = LiveBroker(client, "USDT-FUTURES", enabled=False, confirm=lambda: True)
    eng = ExecutionEngine(broker=broker, portfolio=Portfolio(equity=1000.0))
    res = eng.place(_order(), 100.0)
    assert not res.filled and "live gate" in res.reason
    assert client.calls == []  # never called the exchange


def test_live_blocked_when_not_confirmed() -> None:
    client = _FakeClient()
    broker = LiveBroker(client, "USDT-FUTURES", enabled=True, confirm=lambda: False)
    eng = ExecutionEngine(broker=broker, portfolio=Portfolio(equity=1000.0))
    res = eng.place(_order(), 100.0)
    assert not res.filled and client.calls == []


def test_live_places_order_when_confirmed() -> None:
    client = _FakeClient()
    broker = LiveBroker(client, "USDT-FUTURES", enabled=True, confirm=lambda: True)
    eng = ExecutionEngine(broker=broker, portfolio=Portfolio(equity=1000.0))
    res = eng.place(_order(side="long", price=100.0), 100.0)
    assert res.filled
    name, args = client.calls[0]
    assert name == "order" and args["action"] == "place"
    assert args["side"] == "buy"  # long -> buy
    assert abs(float(args["size"]) - 50.0) < 1e-9  # notional 5000 / price 100


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All execution tests passed.")


if __name__ == "__main__":
    _run_all()
