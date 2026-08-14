"""Execution engine: unified place/close with a mandatory risk gate.

Default is paper trading. Live trading requires BOTH an explicit enable flag AND
a passing confirmation callback, and routes through the MCP `order` tool. The
DL direct-connection execution path is deferred to #7.

Every order MUST pass the circuit-breaker check and the risk check before any
broker is invoked (design D2).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Protocol

from market_data.risk import (
    OrderDecision,
    Portfolio,
    Position,
    RiskEngine,
)


@dataclass
class OrderRequest:
    category: str
    symbol: str
    side: str  # "long" | "short"
    intended_leverage: float
    price: float | None = None


@dataclass
class ExecutionResult:
    approved: bool
    filled: bool
    reason: str
    decision: OrderDecision | None = None
    position: Position | None = None


class Broker(Protocol):
    def open(
        self, portfolio: Portfolio, order: OrderRequest, decision: OrderDecision, price: float
    ) -> Position: ...

    def close(self, portfolio: Portfolio, symbol: str, price: float) -> float: ...


class PaperBroker:
    """In-memory simulated fills (no slippage/fees)."""

    def open(
        self, portfolio: Portfolio, order: OrderRequest, decision: OrderDecision, price: float
    ) -> Position:
        existing = portfolio.positions.get(order.symbol)
        if existing is None:
            pos = Position(
                symbol=order.symbol,
                side=order.side,
                margin=decision.margin,
                notional=decision.notional,
                entry_price=price,
                leverage=decision.leverage,
                adds=1,
            )
        else:
            total_notional = existing.notional + decision.notional
            # Volume-weighted average entry price.
            avg_entry = (
                existing.entry_price * existing.notional + price * decision.notional
            ) / total_notional
            existing.margin += decision.margin
            existing.notional = total_notional
            existing.entry_price = avg_entry
            existing.adds += 1
            pos = existing
        portfolio.positions[order.symbol] = pos
        return pos

    def close(self, portfolio: Portfolio, symbol: str, price: float) -> float:
        pos = portfolio.positions.get(symbol)
        if pos is None:
            return 0.0
        direction = 1.0 if pos.side == "long" else -1.0
        pnl = pos.notional * (price - pos.entry_price) / pos.entry_price * direction
        portfolio.equity += pnl
        portfolio.peak_equity = max(portfolio.peak_equity, portfolio.equity)
        del portfolio.positions[symbol]
        return pnl


class LiveBroker:
    """Routes orders through the MCP `order` tool. Guarded by the engine's
    live_enabled + confirm gate; this broker also re-checks that gate."""

    def __init__(self, client, category: str, enabled: bool, confirm: Callable[[], bool]):  # noqa: ANN001
        self._client = client
        self._category = category
        self._enabled = enabled
        self._confirm = confirm

    def _gate(self) -> None:
        if not self._enabled:
            raise PermissionError("live trading not enabled")
        if not self._confirm():
            raise PermissionError("live trading not confirmed")

    def open(
        self, portfolio: Portfolio, order: OrderRequest, decision: OrderDecision, price: float
    ) -> Position:
        self._gate()
        size = decision.notional / price
        self._client.call_tool(
            "order",
            {
                "action": "place",
                "category": order.category,
                "symbol": order.symbol,
                "side": "buy" if order.side == "long" else "sell",
                "orderType": "market",
                "size": str(size),
            },
        )
        pos = Position(
            symbol=order.symbol,
            side=order.side,
            margin=decision.margin,
            notional=decision.notional,
            entry_price=price,
            leverage=decision.leverage,
            adds=(portfolio.symbol_adds(order.symbol) + 1),
        )
        portfolio.positions[order.symbol] = pos
        return pos

    def close(self, portfolio: Portfolio, symbol: str, price: float) -> float:
        self._gate()
        pos = portfolio.positions.get(symbol)
        if pos is None:
            return 0.0
        self._client.call_tool(
            "order",
            {
                "action": "place",
                "category": self._category,
                "symbol": symbol,
                "side": "sell" if pos.side == "long" else "buy",
                "orderType": "market",
                "size": str(pos.notional / price),
                "reduceOnly": "true",
            },
        )
        del portfolio.positions[symbol]
        return 0.0


class ExecutionEngine:
    def __init__(
        self,
        risk_engine: RiskEngine | None = None,
        broker: Broker | None = None,
        portfolio: Portfolio | None = None,
    ) -> None:
        self.risk = risk_engine or RiskEngine()
        self.broker: Broker = broker or PaperBroker()
        self.portfolio = portfolio or Portfolio(equity=0.0)

    def place(self, order: OrderRequest, price: float) -> ExecutionResult:
        # 1) circuit breaker gate.
        tripped, msg = self.risk.check_circuit_breaker(self.portfolio)
        if tripped:
            return ExecutionResult(False, False, f"circuit breaker: {msg}")

        # 2) risk check.
        decision = self.risk.check_order(
            self.portfolio, order.symbol, order.intended_leverage
        )
        if not decision.approved:
            return ExecutionResult(False, False, decision.reason, decision)

        # 3) broker execution. Live-safety gate failures surface as a rejection
        # (consistent with other rejections) rather than an exception.
        try:
            pos = self.broker.open(self.portfolio, order, decision, price)
        except PermissionError as exc:
            return ExecutionResult(False, False, f"live gate: {exc}", decision)
        return ExecutionResult(True, True, decision.reason, decision, pos)

    def close(self, symbol: str, price: float) -> float:
        return self.broker.close(self.portfolio, symbol, price)

    def enforce_circuit_breaker(self) -> list[Position]:
        """Return positions that should be closed when the breaker is tripped."""
        tripped, _ = self.risk.check_circuit_breaker(self.portfolio)
        return list(self.portfolio.positions.values()) if tripped else []
