"""Offline tests for the execution engine (paper + risk gate + live safety).

Run:
    python tests/test_execution.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from market_data.events import EventLog
from market_data.execution import (
    BrokerError,
    ExecutionEngine,
    LiveBroker,
    OrderRequest,
    PaperBroker,
)
from market_data.mcp_client import McpError
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


# -- 6.4b circuit-breaker event logging ------------------------------------
def test_circuit_breaker_blocked_records_event() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        log = EventLog(Path(tmp) / "events" / "circuit_breaker.jsonl")
        eng = ExecutionEngine(portfolio=Portfolio(equity=850.0, peak_equity=1000.0), event_log=log)
        res = eng.place(_order(), 100.0)
        assert not res.filled and "circuit breaker" in res.reason
        events = log.list(kind="circuit_breaker")
        assert len(events) == 1
        payload = events[0]["payload"]
        assert payload["action"] == "blocked"
        assert payload["equity"] == 850.0 and payload["peak_equity"] == 1000.0
        assert abs(payload["drawdown"] - 0.15) < 1e-9
        assert "drawdown" in payload["reason"]


def test_enforce_records_event_with_symbols() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        log = EventLog(Path(tmp) / "circuit_breaker.jsonl")
        pf = Portfolio(equity=850.0, peak_equity=1000.0)
        pf.positions["BTCUSDT"] = Position("BTCUSDT", "long", 50.0, 5000.0, 100.0, 100)
        eng = ExecutionEngine(portfolio=pf, event_log=log)
        to_close = eng.enforce_circuit_breaker()
        assert [p.symbol for p in to_close] == ["BTCUSDT"]
        events = log.list(kind="circuit_breaker")
        assert len(events) == 1
        assert events[0]["payload"]["action"] == "enforced"
        assert events[0]["payload"]["symbols"] == ["BTCUSDT"]


def test_no_event_when_breaker_within_limit() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        log = EventLog(Path(tmp) / "circuit_breaker.jsonl")
        eng = ExecutionEngine(portfolio=Portfolio(equity=1000.0, peak_equity=1000.0), event_log=log)
        res = eng.place(_order(), 100.0)
        assert res.filled
        assert eng.enforce_circuit_breaker() == []
        assert log.list() == []


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


# -- 6.6 live close PnL / equity settlement -------------------------------
class _FakeFillClient:
    """Fake MCP client returning a canned `order` response (or raising)."""

    def __init__(self, response=None, error: Exception | None = None) -> None:
        self.response = response
        self.error = error
        self.calls: list[tuple[str, dict]] = []

    def call_tool(self, name, arguments):  # noqa: ANN001
        self.calls.append((name, arguments))
        if self.error is not None:
            raise self.error
        return self.response


def _live_engine(portfolio: Portfolio, client) -> ExecutionEngine:  # noqa: ANN001
    broker = LiveBroker(client, "USDT-FUTURES", enabled=True, confirm=lambda: True)
    return ExecutionEngine(broker=broker, portfolio=portfolio)


def test_live_close_long_profit_updates_equity_and_peak() -> None:
    client = _FakeFillClient(response={"ok": True})  # no fill price -> fallback
    pf = Portfolio(equity=1000.0, peak_equity=1000.0)
    eng = _live_engine(pf, client)
    eng.place(_order(side="long", price=100.0), 100.0)  # notional 5000 @ 100
    pnl = eng.close("BTCUSDT", 101.0)  # +1% * 5000 = +50, from passed price
    assert abs(pnl - 50.0) < 1e-9
    assert abs(pf.equity - 1050.0) < 1e-9
    assert abs(pf.peak_equity - 1050.0) < 1e-9
    assert "BTCUSDT" not in pf.positions
    # reduce-only market close: long -> sell
    name, args = client.calls[-1]
    assert name == "order"
    assert args["side"] == "sell" and args["reduceOnly"] == "true"


def test_live_close_short_profit_and_loss() -> None:
    # short entry 100, exit 99 -> +50
    win = _FakeFillClient(response={"ok": True})
    pf_win = Portfolio(equity=1000.0, peak_equity=1000.0)
    eng_win = _live_engine(pf_win, win)
    eng_win.place(_order(side="short", price=100.0), 100.0)
    pnl_win = eng_win.close("BTCUSDT", 99.0)
    assert abs(pnl_win - 50.0) < 1e-9
    assert abs(pf_win.equity - 1050.0) < 1e-9
    assert abs(pf_win.peak_equity - 1050.0) < 1e-9
    assert win.calls[-1][1]["side"] == "buy"  # short -> buy to close

    # short entry 100, exit 101 -> -50, peak stays at old high
    loss = _FakeFillClient(response={"ok": True})
    pf_loss = Portfolio(equity=1000.0, peak_equity=1000.0)
    eng_loss = _live_engine(pf_loss, loss)
    eng_loss.place(_order(side="short", price=100.0), 100.0)
    pnl_loss = eng_loss.close("BTCUSDT", 101.0)
    assert abs(pnl_loss + 50.0) < 1e-9
    assert abs(pf_loss.equity - 950.0) < 1e-9
    assert abs(pf_loss.peak_equity - 1000.0) < 1e-9


def test_live_close_without_position_returns_zero_no_equity_change() -> None:
    client = _FakeFillClient(response={"ok": True})
    pf = Portfolio(equity=1000.0, peak_equity=1000.0)
    eng = _live_engine(pf, client)
    pnl = eng.close("BTCUSDT", 101.0)
    assert pnl == 0.0
    assert pf.equity == 1000.0 and pf.peak_equity == 1000.0
    assert client.calls == []  # no MCP call when there is nothing to close


def test_live_close_prefers_mcp_fill_price() -> None:
    # response avgPrice 101 wins over the passed 95 -> +50 (not -250).
    client = _FakeFillClient(response={"avgPrice": "101.0"})
    pf = Portfolio(equity=1000.0, peak_equity=1000.0)
    eng = _live_engine(pf, client)
    eng.place(_order(side="long", price=100.0), 100.0)
    pnl = eng.close("BTCUSDT", 95.0)
    assert abs(pnl - 50.0) < 1e-9
    assert abs(pf.equity - 1050.0) < 1e-9


def test_live_close_extracts_fill_price_from_nested_data() -> None:
    client = _FakeFillClient(response={"data": {"price": "99.0"}})
    pf = Portfolio(equity=1000.0, peak_equity=1000.0)
    eng = _live_engine(pf, client)
    eng.place(_order(side="long", price=100.0), 100.0)
    pnl = eng.close("BTCUSDT", 101.0)  # nested 99 wins over passed 101 -> -50
    assert abs(pnl + 50.0) < 1e-9
    assert abs(pf.equity - 950.0) < 1e-9


def test_live_close_falls_back_to_passed_price_without_fill() -> None:
    client = _FakeFillClient(response={"ok": True})
    pf = Portfolio(equity=1000.0, peak_equity=1000.0)
    eng = _live_engine(pf, client)
    eng.place(_order(side="long", price=100.0), 100.0)
    pnl = eng.close("BTCUSDT", 101.0)
    assert abs(pnl - 50.0) < 1e-9


def test_live_close_mcp_failure_raises_and_keeps_position() -> None:
    client = _FakeFillClient(error=McpError("order rejected"))
    pf = Portfolio(equity=1000.0, peak_equity=1000.0)
    pf.positions["BTCUSDT"] = Position("BTCUSDT", "long", 50.0, 5000.0, 100.0, 100)
    eng = _live_engine(pf, client)
    with pytest.raises(BrokerError):
        eng.close("BTCUSDT", 101.0)
    assert "BTCUSDT" in pf.positions  # position preserved
    assert pf.equity == 1000.0 and pf.peak_equity == 1000.0
    assert len(client.calls) == 1


def test_live_open_mcp_failure_raises_without_position() -> None:
    client = _FakeFillClient(error=McpError("order rejected"))
    pf = Portfolio(equity=1000.0, peak_equity=1000.0)
    eng = _live_engine(pf, client)
    with pytest.raises(BrokerError):
        eng.place(_order(side="long", price=100.0), 100.0)
    assert "BTCUSDT" not in pf.positions
    assert pf.equity == 1000.0


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All execution tests passed.")


if __name__ == "__main__":
    _run_all()
