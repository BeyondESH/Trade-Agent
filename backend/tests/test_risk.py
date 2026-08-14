"""Offline tests for the risk & position-sizing engine.

Run:
    python tests/test_risk.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

from market_data.risk import (
    OrderDecision,
    Portfolio,
    Position,
    RiskConfig,
    RiskEngine,
    drawdown_pct,
    liquidation_move_pct,
    size_position,
    stop_move_pct,
)


# -- 7.1 sizing ------------------------------------------------------------
def test_sizing_basic() -> None:
    s = size_position(1000.0, 100.0, RiskConfig())
    assert s.margin == 50.0 and s.notional == 5000.0 and s.leverage == 100.0


# -- 7.2 clamps ------------------------------------------------------------
def test_leverage_capped() -> None:
    s = size_position(1000.0, 250.0, RiskConfig(max_leverage=100))
    assert s.leverage == 100.0 and s.clamped and "leverage" in s.reason


def test_margin_reduced_by_total_cap() -> None:
    cfg = RiskConfig()  # 5% total
    pf = Portfolio(equity=1000.0)
    pf.positions["ETHUSDT"] = Position("ETHUSDT", "long", margin=30.0, notional=3000.0,
                                       entry_price=1.0, leverage=100)
    # 30 used, cap 50 -> only 20 room.
    s = size_position(1000.0, 100.0, cfg, pf, "BTCUSDT")
    assert s.margin == 20.0 and s.clamped


def test_no_room_rejects() -> None:
    cfg = RiskConfig()
    pf = Portfolio(equity=1000.0)
    pf.positions["ETHUSDT"] = Position("ETHUSDT", "long", margin=50.0, notional=5000.0,
                                       entry_price=1.0, leverage=100)
    s = size_position(1000.0, 100.0, cfg, pf, "BTCUSDT")
    assert s.margin == 0.0 and "no available margin" in s.reason


# -- 7.3 order checks ------------------------------------------------------
def test_check_order_approves() -> None:
    d = RiskEngine().check_order(Portfolio(equity=1000.0), "BTCUSDT", 100.0)
    assert isinstance(d, OrderDecision) and d.approved and d.margin == 50.0


def test_max_adds_rejects() -> None:
    cfg = RiskConfig(max_adds=2)
    pf = Portfolio(equity=1000.0)
    pf.positions["BTCUSDT"] = Position("BTCUSDT", "long", margin=10.0, notional=1000.0,
                                       entry_price=1.0, leverage=100, adds=2)
    d = RiskEngine(cfg).check_order(pf, "BTCUSDT", 100.0)
    assert not d.approved and "adds" in d.reason


def test_portfolio_full_rejects() -> None:
    pf = Portfolio(equity=1000.0)
    pf.positions["ETHUSDT"] = Position("ETHUSDT", "long", margin=50.0, notional=5000.0,
                                       entry_price=1.0, leverage=100)
    d = RiskEngine().check_order(pf, "BTCUSDT", 100.0)
    assert not d.approved


def test_check_order_reduces_when_partial_room() -> None:
    # ETH uses 30 of the 50 total cap -> BTC order approved but reduced to 20.
    pf = Portfolio(equity=1000.0)
    pf.positions["ETHUSDT"] = Position("ETHUSDT", "long", margin=30.0, notional=3000.0,
                                       entry_price=1.0, leverage=100)
    d = RiskEngine().check_order(pf, "BTCUSDT", 100.0)
    assert d.approved and d.margin == 20.0 and d.notional == 2000.0
    assert "reduced" in d.reason


# -- 7.4 circuit breaker ---------------------------------------------------
def test_circuit_breaker_triggers() -> None:
    pf = Portfolio(equity=850.0, peak_equity=1000.0)  # 15% drawdown
    tripped, msg = RiskEngine().check_circuit_breaker(pf)
    assert tripped and "close" in msg


def test_circuit_breaker_within_limit() -> None:
    pf = Portfolio(equity=950.0, peak_equity=1000.0)  # 5% drawdown
    tripped, _ = RiskEngine().check_circuit_breaker(pf)
    assert not tripped
    assert abs(drawdown_pct(pf) - 0.05) < 1e-9


# -- 7.5 stop earlier than liquidation ------------------------------------
def test_stop_earlier_than_liquidation() -> None:
    cfg = RiskConfig()  # 15%
    equity, notional = 1000.0, 5000.0
    liq = liquidation_move_pct(notional, equity)   # ~20%
    stop = stop_move_pct(notional, equity, cfg)     # ~3%
    assert stop < liq
    assert abs(stop / liq - cfg.max_drawdown_pct) < 1e-9  # ratio == max_drawdown_pct


# -- 7.6 config validation -------------------------------------------------
def test_config_rejects_bad_values() -> None:
    for kwargs in ({"margin_pct": 1.5}, {"max_leverage": 0.5}, {"max_drawdown_pct": 0.0}):
        raised = False
        try:
            RiskConfig(**kwargs)
        except ValueError:
            raised = True
        assert raised, f"RiskConfig({kwargs}) should raise"


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All risk tests passed.")


if __name__ == "__main__":
    _run_all()
