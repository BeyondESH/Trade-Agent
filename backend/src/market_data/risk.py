"""Risk & position-sizing engine (cross-margin model).

Pure, deterministic, exchange-free. Enforces the roadmap risk model (design D3):
- cross margin
- total committed margin <= margin_pct * equity (configurable)
- single-symbol margin <= max_symbol_margin_pct * equity
- leverage capped at max_leverage
- per-symbol add count capped at max_adds
- portfolio drawdown circuit breaker at max_drawdown_pct
- guaranteed: stop distance < liquidation distance (ratio == max_drawdown_pct)

This layer is the hard gate the execution layer (#4) must pass before placing
any order. It never touches the exchange.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class RiskConfig:
    margin_pct: float = 0.05
    max_drawdown_pct: float = 0.15
    max_leverage: float = 100.0
    max_adds: int = 3
    max_symbol_margin_pct: float = 0.05

    def __post_init__(self) -> None:
        for name in ("margin_pct", "max_drawdown_pct", "max_symbol_margin_pct"):
            v = getattr(self, name)
            if not (0.0 < v <= 1.0):
                raise ValueError(f"{name} must be in (0, 1], got {v}")
        if self.max_leverage < 1.0:
            raise ValueError(f"max_leverage must be >= 1, got {self.max_leverage}")
        if self.max_adds < 0:
            raise ValueError(f"max_adds must be >= 0, got {self.max_adds}")


@dataclass
class Position:
    symbol: str
    side: str  # "long" | "short"
    margin: float
    notional: float
    entry_price: float
    leverage: float
    adds: int = 0


@dataclass
class Portfolio:
    equity: float
    peak_equity: float = 0.0
    positions: dict[str, Position] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.peak_equity <= 0.0:
            self.peak_equity = self.equity

    def used_margin(self) -> float:
        return sum(p.margin for p in self.positions.values())

    def symbol_margin(self, symbol: str) -> float:
        p = self.positions.get(symbol)
        return p.margin if p else 0.0

    def symbol_adds(self, symbol: str) -> int:
        p = self.positions.get(symbol)
        return p.adds if p else 0


@dataclass
class Sizing:
    margin: float
    notional: float
    leverage: float
    clamped: bool
    reason: str


@dataclass
class OrderDecision:
    approved: bool
    margin: float
    notional: float
    leverage: float
    reason: str


def size_position(
    equity: float,
    intended_leverage: float,
    config: RiskConfig,
    portfolio: Portfolio | None = None,
    symbol: str = "",
) -> Sizing:
    """Compute margin/notional under all caps. Returns margin=0 when no room."""
    reasons: list[str] = []
    leverage = intended_leverage
    clamped = False
    if leverage > config.max_leverage:
        leverage = config.max_leverage
        clamped = True
        reasons.append(f"leverage capped to {config.max_leverage}")

    intended_margin = equity * config.margin_pct

    # Remaining room from portfolio-total and per-symbol caps.
    total_cap = equity * config.margin_pct
    symbol_cap = equity * config.max_symbol_margin_pct
    used_total = portfolio.used_margin() if portfolio else 0.0
    used_symbol = portfolio.symbol_margin(symbol) if portfolio else 0.0

    room = min(total_cap - used_total, symbol_cap - used_symbol)
    room = max(room, 0.0)
    margin = min(intended_margin, room)
    if margin < intended_margin:
        clamped = True
        reasons.append("margin reduced to fit caps")
    if margin <= 0.0:
        reasons.append("no available margin room")

    return Sizing(
        margin=margin,
        notional=margin * leverage,
        leverage=leverage,
        clamped=clamped,
        reason="; ".join(reasons) or "ok",
    )


class RiskEngine:
    def __init__(self, config: RiskConfig | None = None) -> None:
        self.config = config or RiskConfig()

    def check_order(
        self,
        portfolio: Portfolio,
        symbol: str,
        intended_leverage: float,
    ) -> OrderDecision:
        cfg = self.config
        # 1) add-count cap (reject).
        if portfolio.symbol_adds(symbol) >= cfg.max_adds:
            return OrderDecision(False, 0.0, 0.0, 0.0, "max adds reached for symbol")

        # 2) leverage cap + 3/4) margin caps via sizing.
        sizing = size_position(
            portfolio.equity, intended_leverage, cfg, portfolio, symbol
        )
        if sizing.margin <= 0.0:
            return OrderDecision(False, 0.0, 0.0, sizing.leverage, sizing.reason)
        return OrderDecision(
            True, sizing.margin, sizing.notional, sizing.leverage, sizing.reason
        )

    def check_circuit_breaker(self, portfolio: Portfolio) -> tuple[bool, str]:
        dd = drawdown_pct(portfolio)
        if dd >= self.config.max_drawdown_pct:
            return True, (
                f"drawdown {dd:.1%} >= {self.config.max_drawdown_pct:.1%}; close positions"
            )
        return False, f"drawdown {dd:.1%} within limit"


def drawdown_pct(portfolio: Portfolio) -> float:
    if portfolio.peak_equity <= 0.0:
        return 0.0
    return max(0.0, (portfolio.peak_equity - portfolio.equity) / portfolio.peak_equity)


def liquidation_move_pct(notional: float, equity: float) -> float:
    """Approx adverse price move to cross-margin liquidation (ignores maintenance)."""
    if notional <= 0.0:
        return float("inf")
    return equity / notional


def stop_move_pct(notional: float, equity: float, config: RiskConfig) -> float:
    """Adverse price move at which equity drawdown hits the circuit-breaker."""
    if notional <= 0.0:
        return float("inf")
    return config.max_drawdown_pct * equity / notional
