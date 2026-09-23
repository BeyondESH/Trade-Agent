"""Execution engine: unified place/close with a mandatory risk gate.

Default is paper trading. Live trading requires BOTH an explicit enable flag AND
a passing confirmation callback, and routes through the MCP `order` tool. The
DL direct-connection execution path is deferred to #7.

Every order MUST pass the circuit-breaker check and the risk check before any
broker is invoked (design D2).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

from market_data.risk import (
    OrderDecision,
    Portfolio,
    Position,
    RiskEngine,
    drawdown_pct,
)

logger = logging.getLogger(__name__)


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


class EventSink(Protocol):
    """Minimal structured-event sink (satisfied by `market_data.events.EventLog`)."""

    def append(self, kind: str, payload: dict) -> Any: ...


class BrokerError(RuntimeError):
    """Discernible execution-layer failure of a broker order.

    Raised when a broker's downstream call (e.g. the MCP `order` tool) fails.
    Unlike a live-gate `PermissionError` (which the engine surfaces as a
    rejection with `filled=false`), a `BrokerError` propagates to the caller so
    the API layer can translate it into a structured upstream-failure response.
    """


def settle_close(portfolio: Portfolio, symbol: str, exit_price: float) -> float:
    """Settle a close against `portfolio`, shared by paper and live brokers.

    No open position -> `0.0` with equity/peak untouched. Otherwise realized
    PnL is `notional * (exit_price - entry) / entry * direction`, equity and
    peak equity are updated, the position is removed, and the PnL is returned.
    """
    pos = portfolio.positions.get(symbol)
    if pos is None:
        return 0.0
    direction = 1.0 if pos.side == "long" else -1.0
    pnl = pos.notional * (exit_price - pos.entry_price) / pos.entry_price * direction
    portfolio.equity += pnl
    portfolio.peak_equity = max(portfolio.peak_equity, portfolio.equity)
    del portfolio.positions[symbol]
    return pnl


_FILL_PRICE_KEYS = ("avgPrice", "averagePrice", "fillPrice", "price", "lastPrice")


def _to_float(value) -> float | None:  # noqa: ANN001
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except (TypeError, ValueError):
            return None
    return None


def _extract_fill_price(payload) -> float | None:  # noqa: ANN001
    """Best-effort fill price from an MCP `order` response (None if absent).

    The MCP response shape is not contractually pinned, so candidate keys are
    checked in priority order at the top level and then inside `data`/`result`
    nesting. Any parse failure yields `None` so the caller can fall back.
    """
    try:
        if isinstance(payload, dict):
            for key in _FILL_PRICE_KEYS:
                price = _to_float(payload.get(key))
                if price is not None:
                    return price
            for nested in ("data", "result"):
                if nested in payload:
                    price = _extract_fill_price(payload[nested])
                    if price is not None:
                        return price
            return None
        return _to_float(payload)
    except Exception:  # noqa: BLE001 - extraction is best-effort
        return None


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
        return settle_close(portfolio, symbol, price)


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
        try:
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
        except Exception as exc:  # noqa: BLE001 - wrap transport/broker failures
            raise BrokerError(f"live order failed: {exc}") from exc
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
        try:
            resp = self._client.call_tool(
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
        except Exception as exc:  # noqa: BLE001 - wrap transport/broker failures
            raise BrokerError(f"live order failed: {exc}") from exc
        fill_price = _extract_fill_price(resp) or price
        return settle_close(portfolio, symbol, fill_price)


class ExecutionEngine:
    def __init__(
        self,
        risk_engine: RiskEngine | None = None,
        broker: Broker | None = None,
        portfolio: Portfolio | None = None,
        event_log: EventSink | None = None,
    ) -> None:
        self.risk = risk_engine or RiskEngine()
        self.broker: Broker = broker or PaperBroker()
        self.portfolio = portfolio or Portfolio(equity=0.0)
        self.event_log = event_log

    def _record_event(self, action: str, fields: dict) -> None:
        """Persist a circuit-breaker event; logging must never break the gate."""
        if self.event_log is None:
            return
        try:
            self.event_log.append("circuit_breaker", {"action": action, **fields})
        except Exception:  # noqa: BLE001 - event log is best-effort
            logger.warning("failed to record circuit-breaker event", exc_info=True)

    def _circuit_breaker_payload(self) -> dict:
        return {
            "equity": self.portfolio.equity,
            "peak_equity": self.portfolio.peak_equity,
            "drawdown": drawdown_pct(self.portfolio),
        }

    def place(self, order: OrderRequest, price: float) -> ExecutionResult:
        # 1) circuit breaker gate.
        tripped, msg = self.risk.check_circuit_breaker(self.portfolio)
        if tripped:
            self._record_event("blocked", {"reason": msg, **self._circuit_breaker_payload()})
            return ExecutionResult(False, False, f"circuit breaker: {msg}")

        # 2) risk check.
        decision = self.risk.check_order(self.portfolio, order.symbol, order.intended_leverage)
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
        if not tripped:
            return []
        to_close = list(self.portfolio.positions.values())
        self._record_event(
            "enforced",
            {
                **self._circuit_breaker_payload(),
                "symbols": [p.symbol for p in to_close],
            },
        )
        return to_close
