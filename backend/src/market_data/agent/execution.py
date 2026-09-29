"""Tier 2: the deterministic, zero-LLM execution graph (execution-graph capability).

A ``StateGraph`` over a plain ``TypedDict``: every node does pure computation or
I/O only. Any failure routes to ``fail_closed`` — there is no "guess a default
and continue" path. Position size is computed deterministically from account
equity and the configured risk fraction; any size or leverage a proposal may
carry is ignored by construction.

This module MUST stay LLM-free: it may import ``langgraph`` but never any
agent / chat-model framework (enforced by a contract test that scans it and
``broker.py``).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any, Protocol, TypedDict

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, StateGraph
from pydantic import ValidationError

from market_data.agent.broker import BrokerRejected, PaperBroker, Side
from market_data.agent.proposal import ProposalAction, StrategyProposal
from market_data.config import Settings
from market_data.events import EventLog

# Whitelisted nodes: the contract test asserts the compiled graph matches this.
EXECUTION_NODES: tuple[str, ...] = (
    "ingest_intent",
    "resolve_market",
    "pre_trade_checks",
    "risk_gate",
    "size_position",
    "build_order",
    "submit",
    "reconcile",
    "audit",
    "fail_closed",
)

FAIL_CLOSED = "fail_closed"


@dataclass(frozen=True)
class RiskLimits:
    """Hard, configurable limits enforced before any order is built."""

    max_leverage: float
    max_symbol_notional: float
    max_portfolio_notional: float
    max_drawdown: float
    risk_fraction: float
    max_quote_age_ms: int = 60_000

    @classmethod
    def from_settings(cls, settings: Settings) -> RiskLimits:
        return cls(
            max_leverage=settings.agent_max_leverage,
            max_symbol_notional=settings.agent_max_symbol_notional,
            max_portfolio_notional=settings.agent_max_portfolio_notional,
            max_drawdown=settings.agent_max_drawdown,
            risk_fraction=settings.agent_risk_fraction,
        )


@dataclass(frozen=True)
class Quote:
    """A resolved, point-in-time market price."""

    symbol: str
    price: float
    ts: int


class MarketResolver(Protocol):
    """Injected market source; returns ``None`` when the symbol is untradable."""

    def __call__(self, symbol: str, category: str) -> Quote | None: ...


@dataclass(frozen=True)
class PositionPlan:
    """Deterministic sizing output (never derived from a proposal's own size)."""

    qty: float
    notional: float
    leverage: float
    risk_amount: float
    stop_distance: float | None


def plan_position(
    *, equity: float, price: float, stop_loss: float | None, risk_fraction: float
) -> PositionPlan:
    """Size from equity + risk fraction only: risk ``risk_fraction`` of equity to the stop.

    The proposal's ``stop_loss`` defines the *risk distance* (a risk concept), not
    the position size. No proposal-supplied quantity or leverage is read here.
    """
    if equity <= 0 or price <= 0 or risk_fraction <= 0:
        return PositionPlan(
            qty=0.0, notional=0.0, leverage=0.0, risk_amount=0.0, stop_distance=None
        )
    risk_amount = equity * risk_fraction
    if stop_loss is None or stop_loss <= 0 or stop_loss == price:
        stop_distance = None
        notional = risk_amount
    else:
        stop_distance = abs(price - stop_loss)
        notional = (risk_amount / stop_distance) * price
    return PositionPlan(
        qty=notional / price,
        notional=notional,
        leverage=notional / equity,
        risk_amount=risk_amount,
        stop_distance=stop_distance,
    )


class ExecutionState(TypedDict, total=False):
    """Plain-data execution state (no messages, no objects the checkpointer can't encode)."""

    proposal: dict[str, Any]
    now_ms: int
    intent: dict[str, Any]
    proposal_id: str
    symbol: str
    category: str
    action: str
    is_entry: bool
    side: str | None
    entry_kind: str
    entry_price: float | None
    stop_loss: float | None
    take_profit: float | None
    produced_at_ms: int
    expires_at_ms: int
    mark_price: float
    quote_ts: int
    market_ok: bool
    market_reason: str
    plan: dict[str, Any]
    qty: float
    notional: float
    leverage: float
    order: dict[str, Any]
    idempotency_key: str
    fill: dict[str, Any]
    account: dict[str, Any]
    status: str
    failed: bool
    reason: str
    audit: list[dict[str, Any]]


@dataclass(frozen=True)
class _Context:
    broker: PaperBroker
    market: MarketResolver
    limits: RiskLimits
    events: EventLog | None
    kill_switch: bool
    clock: Callable[[], datetime]


def _step(
    state: ExecutionState, ctx: _Context, node: str, ok: bool = True, **fields: Any
) -> list[dict[str, Any]]:
    """Append one audit entry to the log (if any) and to the in-state trail."""
    entry: dict[str, Any] = {"node": node, "ok": ok, "ts": state.get("now_ms", 0), **fields}
    if ctx.events is not None:
        ctx.events.append("execution_step", entry)
    return [*state.get("audit", []), entry]


def _fail(state: ExecutionState, ctx: _Context, node: str, reason: str) -> dict[str, Any]:
    return {
        "failed": True,
        "status": "failed",
        "reason": f"{node}: {reason}",
        "audit": _step(state, ctx, node, ok=False, reason=reason),
    }


def _route_or_fail(next_node: str) -> Callable[[ExecutionState], str]:
    def route(state: ExecutionState) -> str:
        return FAIL_CLOSED if state.get("failed") else next_node

    return route


# -- nodes -----------------------------------------------------------------
def _ingest_intent(state: ExecutionState, ctx: _Context) -> dict[str, Any]:
    raw = state.get("proposal") or {}
    try:
        proposal = StrategyProposal.model_validate(raw)
    except ValidationError as exc:
        errors = exc.errors()
        first = errors[0].get("msg", "invalid proposal") if errors else "invalid proposal"
        return _fail(state, ctx, "ingest_intent", f"schema invalid: {first}")
    now_ms = state.get("now_ms")
    if now_ms is None:
        now_ms = int(ctx.clock().timestamp() * 1000)
    is_entry = proposal.action in (ProposalAction.OPEN_LONG, ProposalAction.OPEN_SHORT)
    if proposal.action is ProposalAction.OPEN_LONG:
        side: str | None = "long"
    elif proposal.action is ProposalAction.OPEN_SHORT:
        side = "short"
    else:
        side = None
    update: dict[str, Any] = {
        "now_ms": now_ms,
        "intent": proposal.model_dump(mode="json"),
        "proposal_id": proposal.proposal_id,
        "symbol": proposal.symbol,
        "category": proposal.category,
        "action": proposal.action.value,
        "is_entry": is_entry,
        "side": side,
        "entry_kind": proposal.entry.kind.value,
        "entry_price": proposal.entry.price,
        "stop_loss": proposal.stop_loss,
        "take_profit": proposal.take_profit,
        "produced_at_ms": int(proposal.produced_at.timestamp() * 1000),
        "expires_at_ms": int(proposal.expires_at.timestamp() * 1000),
    }
    update["audit"] = _step({**state, **update}, ctx, "ingest_intent", ok=True)
    return update


def _resolve_market(state: ExecutionState, ctx: _Context) -> dict[str, Any]:
    symbol = state.get("symbol", "")
    quote = ctx.market(symbol, state.get("category", ""))
    if quote is None or quote.price <= 0:
        return {
            "market_ok": False,
            "market_reason": f"no tradable quote for {symbol}",
            "audit": _step(state, ctx, "resolve_market", ok=False, market_ok=False),
        }
    return {
        "market_ok": True,
        "mark_price": float(quote.price),
        "quote_ts": int(quote.ts),
        "audit": _step(state, ctx, "resolve_market", ok=True, market_ok=True),
    }


def _pre_trade_checks(state: ExecutionState, ctx: _Context) -> dict[str, Any]:
    if state["now_ms"] >= state["expires_at_ms"]:
        return _fail(state, ctx, "pre_trade_checks", "proposal expired (TTL)")
    if not state.get("market_ok"):
        return _fail(
            state, ctx, "pre_trade_checks", state.get("market_reason", "market not tradable")
        )
    if state["now_ms"] - state.get("quote_ts", 0) > ctx.limits.max_quote_age_ms:
        return _fail(state, ctx, "pre_trade_checks", "stale quote")
    symbol = state["symbol"]
    position = ctx.broker.position(symbol)
    if state["is_entry"] and position is not None:
        return _fail(state, ctx, "pre_trade_checks", f"position already open for {symbol}")
    if not state["is_entry"] and position is None:
        return _fail(state, ctx, "pre_trade_checks", f"no open position to exit for {symbol}")
    return {"audit": _step(state, ctx, "pre_trade_checks", ok=True)}


def _risk_gate(state: ExecutionState, ctx: _Context) -> dict[str, Any]:
    equity = ctx.broker.equity
    if state["is_entry"]:
        if ctx.kill_switch:
            return _fail(state, ctx, "risk_gate", "kill-switch engaged")
        if ctx.broker.circuit_breaker:
            return _fail(state, ctx, "risk_gate", "circuit breaker latched")
        if ctx.broker.drawdown > ctx.limits.max_drawdown:
            return _fail(state, ctx, "risk_gate", "drawdown limit breached")
        plan = plan_position(
            equity=equity,
            price=state["mark_price"],
            stop_loss=state.get("stop_loss"),
            risk_fraction=ctx.limits.risk_fraction,
        )
        if plan.qty <= 0:
            return _fail(state, ctx, "risk_gate", "deterministic sizing produced no quantity")
        if plan.leverage > ctx.limits.max_leverage:
            return _fail(
                state,
                ctx,
                "risk_gate",
                f"leverage {plan.leverage:.6f} exceeds max {ctx.limits.max_leverage}",
            )
        if plan.notional > ctx.limits.max_symbol_notional:
            return _fail(
                state,
                ctx,
                "risk_gate",
                f"symbol notional {plan.notional:.2f} exceeds max {ctx.limits.max_symbol_notional}",
            )
        projected = ctx.broker.portfolio_notional() + plan.notional
        if projected > ctx.limits.max_portfolio_notional:
            return _fail(
                state,
                ctx,
                "risk_gate",
                f"portfolio notional {projected:.2f} exceeds max "
                f"{ctx.limits.max_portfolio_notional}",
            )
    else:
        # De-risking an existing position: no exposure gates (closing reduces risk).
        position = ctx.broker.position(state["symbol"])
        if position is None:  # guarded by pre_trade_checks; defensive only.
            return _fail(state, ctx, "risk_gate", "no position to size an exit")
        notional = position.notional(state["mark_price"])
        plan = PositionPlan(
            qty=position.qty,
            notional=notional,
            leverage=(notional / equity) if equity > 0 else 0.0,
            risk_amount=0.0,
            stop_distance=None,
        )
    return {
        "plan": asdict(plan),
        "audit": _step(
            state,
            ctx,
            "risk_gate",
            ok=True,
            is_entry=state["is_entry"],
            qty=plan.qty,
            notional=plan.notional,
            leverage=plan.leverage,
        ),
    }


def _size_position(state: ExecutionState, ctx: _Context) -> dict[str, Any]:
    plan = state.get("plan") or {}
    qty = float(plan.get("qty", 0.0))
    if qty <= 0:
        return _fail(state, ctx, "size_position", "sized quantity is not positive")
    return {
        "qty": qty,
        "notional": float(plan.get("notional", 0.0)),
        "leverage": float(plan.get("leverage", 0.0)),
        "audit": _step(state, ctx, "size_position", ok=True, qty=qty),
    }


def _build_order(state: ExecutionState, ctx: _Context) -> dict[str, Any]:
    kind = state.get("entry_kind", "market")
    limit_price = state.get("entry_price")
    if kind == "limit" and limit_price is not None:
        price = float(limit_price)
    else:
        price = float(state["mark_price"])
    order: dict[str, Any] = {
        "symbol": state["symbol"],
        "action": "open" if state["is_entry"] else "close",
        "side": state.get("side"),
        "kind": kind,
        "qty": state["qty"],
        "price": price,
        "notional": state["notional"],
        "leverage": state["leverage"],
    }
    return {
        "order": order,
        "audit": _step(state, ctx, "build_order", ok=True, order=order),
    }


def _submit(state: ExecutionState, ctx: _Context) -> dict[str, Any]:
    order = state["order"]
    key = f"{state['proposal_id']}:{state['symbol']}:{state['action']}"
    existing = ctx.broker.fill_for(key)
    if existing is not None:
        fill = existing
    else:
        try:
            if state["is_entry"]:
                fill = ctx.broker.open(
                    idempotency_key=key,
                    symbol=order["symbol"],
                    side=Side(state["side"]),
                    qty=order["qty"],
                    price=order["price"],
                    ts=state["now_ms"],
                )
            else:
                fill = ctx.broker.close(
                    idempotency_key=key,
                    symbol=order["symbol"],
                    price=order["price"],
                    ts=state["now_ms"],
                )
        except BrokerRejected as exc:
            return _fail(state, ctx, "submit", str(exc))
    return {
        "idempotency_key": key,
        "fill": {
            "idempotency_key": fill.idempotency_key,
            "symbol": fill.symbol,
            "side": fill.side.value,
            "qty": fill.qty,
            "price": fill.price,
            "kind": fill.kind,
            "realized_pnl": fill.realized_pnl,
        },
        "audit": _step(state, ctx, "submit", ok=True, idempotency_key=key),
    }


def _reconcile(state: ExecutionState, ctx: _Context) -> dict[str, Any]:
    symbol = state["symbol"]
    position = ctx.broker.position(symbol)
    if state["is_entry"] and position is None:
        return _fail(state, ctx, "reconcile", "expected an open position after submit")
    if not state["is_entry"] and position is not None:
        return _fail(state, ctx, "reconcile", "expected the position to be flat after submit")
    return {
        "account": ctx.broker.snapshot(),
        "audit": _step(state, ctx, "reconcile", ok=True),
    }


def _audit(state: ExecutionState, ctx: _Context) -> dict[str, Any]:
    return {
        "status": "ok",
        "audit": _step(state, ctx, "audit", ok=True, account=ctx.broker.snapshot()),
    }


def _fail_closed(state: ExecutionState, ctx: _Context) -> dict[str, Any]:
    reason = state.get("reason", "unspecified failure")
    return {
        "status": "failed",
        "audit": _step(state, ctx, "fail_closed", ok=False, reason=reason),
    }


def build_execution_graph(
    *,
    broker: PaperBroker,
    market: MarketResolver,
    limits: RiskLimits,
    checkpointer: BaseCheckpointSaver | None = None,
    events: EventLog | None = None,
    kill_switch: bool = False,
    clock: Callable[[], datetime] | None = None,
) -> Any:
    """Build and compile the deterministic execution graph.

    ``checkpointer`` is passed through untouched: the core never hardcodes a
    SQLite saver (the runtime layer owns persistence wiring).
    """
    ctx = _Context(
        broker=broker,
        market=market,
        limits=limits,
        events=events,
        kill_switch=kill_switch,
        clock=clock or (lambda: datetime.now(UTC)),
    )
    graph: StateGraph = StateGraph(ExecutionState)
    graph.add_node("ingest_intent", lambda s: _ingest_intent(s, ctx))
    graph.add_node("resolve_market", lambda s: _resolve_market(s, ctx))
    graph.add_node("pre_trade_checks", lambda s: _pre_trade_checks(s, ctx))
    graph.add_node("risk_gate", lambda s: _risk_gate(s, ctx))
    graph.add_node("size_position", lambda s: _size_position(s, ctx))
    graph.add_node("build_order", lambda s: _build_order(s, ctx))
    graph.add_node("submit", lambda s: _submit(s, ctx))
    graph.add_node("reconcile", lambda s: _reconcile(s, ctx))
    graph.add_node("audit", lambda s: _audit(s, ctx))
    graph.add_node(FAIL_CLOSED, lambda s: _fail_closed(s, ctx))
    graph.set_entry_point("ingest_intent")
    graph.add_conditional_edges("ingest_intent", _route_or_fail("resolve_market"))
    graph.add_conditional_edges("resolve_market", _route_or_fail("pre_trade_checks"))
    graph.add_conditional_edges("pre_trade_checks", _route_or_fail("risk_gate"))
    graph.add_conditional_edges("risk_gate", _route_or_fail("size_position"))
    graph.add_conditional_edges("size_position", _route_or_fail("build_order"))
    graph.add_conditional_edges("build_order", _route_or_fail("submit"))
    graph.add_conditional_edges("submit", _route_or_fail("reconcile"))
    graph.add_conditional_edges("reconcile", _route_or_fail("audit"))
    graph.add_edge("audit", END)
    graph.add_edge(FAIL_CLOSED, END)
    return graph.compile(checkpointer=checkpointer)
