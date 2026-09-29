"""Deterministic paper broker (paper-broker capability).

No real exchange, no network, no LLM: every fill is priced by the caller and
PnL / equity / drawdown are pure arithmetic. The execution graph reads the
latching circuit-breaker flag before any open.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class Side(StrEnum):
    """Holding direction."""

    LONG = "long"
    SHORT = "short"


class BrokerRejected(Exception):
    """The broker refused an instruction (never a silent no-op)."""


class CircuitBreakerTripped(BrokerRejected):
    """An open was attempted while the drawdown breaker is latched."""


@dataclass(frozen=True)
class Fill:
    """A deterministic settlement record (open or close)."""

    idempotency_key: str
    symbol: str
    side: Side
    qty: float
    price: float
    ts: int
    kind: str
    realized_pnl: float = 0.0


@dataclass
class Position:
    """One open paper position (at most one per symbol in Phase 1)."""

    symbol: str
    side: Side
    qty: float
    entry_price: float
    opened_at: int
    mark_price: float

    def unrealized_pnl(self, price: float | None = None) -> float:
        mark = self.mark_price if price is None else price
        direction = 1.0 if self.side is Side.LONG else -1.0
        return (mark - self.entry_price) * self.qty * direction

    def notional(self, price: float | None = None) -> float:
        mark = self.mark_price if price is None else price
        return abs(self.qty) * mark


@dataclass(frozen=True)
class EquityPoint:
    """A point on the equity curve, with the drawdown observed at that point."""

    ts: int
    equity: float
    drawdown: float


class PaperBroker:
    """In-memory paper account: positions, PnL, equity curve, drawdown breaker."""

    def __init__(self, initial_equity: float, max_drawdown: float) -> None:
        if initial_equity <= 0:
            raise ValueError("initial_equity must be positive")
        if not 0.0 < max_drawdown < 1.0:
            raise ValueError("max_drawdown must be in (0, 1)")
        self.initial_equity = float(initial_equity)
        self.max_drawdown = float(max_drawdown)
        self._positions: dict[str, Position] = {}
        self._realized_pnl = 0.0
        self._fills: list[Fill] = []
        self._by_key: dict[str, Fill] = {}
        self._equity_curve: list[EquityPoint] = [
            EquityPoint(ts=0, equity=self.initial_equity, drawdown=0.0)
        ]
        self._peak_equity = self.initial_equity
        self._circuit_breaker = False

    # -- reads -------------------------------------------------------------
    @property
    def positions(self) -> dict[str, Position]:
        return dict(self._positions)

    @property
    def fills(self) -> list[Fill]:
        return list(self._fills)

    @property
    def realized_pnl(self) -> float:
        return self._realized_pnl

    @property
    def unrealized_pnl(self) -> float:
        return sum(p.unrealized_pnl() for p in self._positions.values())

    @property
    def equity(self) -> float:
        return self.initial_equity + self._realized_pnl + self.unrealized_pnl

    @property
    def peak_equity(self) -> float:
        return self._peak_equity

    @property
    def drawdown(self) -> float:
        if self._peak_equity <= 0:
            return 0.0
        return max(0.0, (self._peak_equity - self.equity) / self._peak_equity)

    @property
    def equity_curve(self) -> list[EquityPoint]:
        return list(self._equity_curve)

    @property
    def circuit_breaker(self) -> bool:
        return self._circuit_breaker

    def position(self, symbol: str) -> Position | None:
        return self._positions.get(symbol)

    def portfolio_notional(self) -> float:
        return sum(p.notional() for p in self._positions.values())

    def fill_for(self, idempotency_key: str) -> Fill | None:
        """Return the fill already produced for a key (idempotent submit check)."""
        return self._by_key.get(idempotency_key)

    # -- writes ------------------------------------------------------------
    def open(
        self,
        *,
        idempotency_key: str,
        symbol: str,
        side: Side,
        qty: float,
        price: float,
        ts: int,
    ) -> Fill:
        """Open a position at ``price``; idempotent on ``idempotency_key``."""
        existing = self._by_key.get(idempotency_key)
        if existing is not None:
            return existing
        if self._circuit_breaker:
            raise CircuitBreakerTripped("cannot open: drawdown circuit breaker is latched")
        if symbol in self._positions:
            raise BrokerRejected(f"position already open for {symbol}")
        if qty <= 0 or price <= 0:
            raise BrokerRejected("qty and price must be positive")
        self._positions[symbol] = Position(
            symbol=symbol,
            side=side,
            qty=float(qty),
            entry_price=float(price),
            opened_at=ts,
            mark_price=float(price),
        )
        fill = Fill(
            idempotency_key=idempotency_key,
            symbol=symbol,
            side=side,
            qty=float(qty),
            price=float(price),
            ts=ts,
            kind="open",
        )
        self._record(fill, ts)
        return fill

    def close(self, *, idempotency_key: str, symbol: str, price: float, ts: int) -> Fill:
        """Settle and remove the position at ``price``; idempotent on the key."""
        existing = self._by_key.get(idempotency_key)
        if existing is not None:
            return existing
        position = self._positions.pop(symbol, None)
        if position is None:
            raise BrokerRejected(f"no open position for {symbol}")
        realized = position.unrealized_pnl(price)
        self._realized_pnl += realized
        fill = Fill(
            idempotency_key=idempotency_key,
            symbol=symbol,
            side=position.side,
            qty=position.qty,
            price=float(price),
            ts=ts,
            kind="close",
            realized_pnl=realized,
        )
        self._record(fill, ts)
        return fill

    def mark(self, symbol: str, price: float, ts: int) -> None:
        """Mark an open position to ``price`` and re-evaluate the breaker."""
        position = self._positions.get(symbol)
        if position is None:
            return
        position.mark_price = float(price)
        self._record_equity(ts)

    def snapshot(self) -> dict:
        """Serialisable account state for audit / projection."""
        return {
            "equity": self.equity,
            "realized_pnl": self._realized_pnl,
            "unrealized_pnl": self.unrealized_pnl,
            "drawdown": self.drawdown,
            "peak_equity": self._peak_equity,
            "circuit_breaker": self._circuit_breaker,
            "positions": {
                symbol: {
                    "side": p.side.value,
                    "qty": p.qty,
                    "entry_price": p.entry_price,
                    "mark_price": p.mark_price,
                    "unrealized_pnl": p.unrealized_pnl(),
                }
                for symbol, p in self._positions.items()
            },
        }

    # -- internals ---------------------------------------------------------
    def _record(self, fill: Fill, ts: int) -> None:
        self._fills.append(fill)
        self._by_key[fill.idempotency_key] = fill
        self._record_equity(ts)

    def _record_equity(self, ts: int) -> None:
        equity = self.equity
        self._peak_equity = max(self._peak_equity, equity)
        drawdown = max(0.0, (self._peak_equity - equity) / self._peak_equity)
        self._equity_curve.append(EquityPoint(ts=ts, equity=equity, drawdown=drawdown))
        if drawdown > self.max_drawdown:
            self._circuit_breaker = True
