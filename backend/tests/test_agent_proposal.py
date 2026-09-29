"""Unit tests for the StrategyProposal contract (strategy-proposal capability)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from market_data.agent.proposal import (
    EntryKind,
    ProposalAction,
    ProposalInvariantError,
    StrategyProposal,
)

T0 = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _raw(**overrides: object) -> dict:
    data: dict = {
        "proposal_id": "p-1",
        "produced_at": T0,
        "expires_at": T0 + timedelta(minutes=5),
        "symbol": "BTCUSDT",
        "category": "USDT-FUTURES",
        "timeframe": "1h",
        "action": "open_long",
        "entry": {"kind": "market"},
        "stop_loss": 99.0,
        "take_profit": 110.0,
        "confidence": 0.6,
        "horizon": "1d",
        "rationale": "momentum",
        "evidence": [{"source": "news", "ref": "url-1"}],
        "provenance": {
            "model": "anthropic:claude-sonnet-4-6",
            "prompt_ver": "v1",
            "research_thread_id": "research:1",
        },
    }
    data.update(overrides)
    return data


def _proposal(**overrides: object) -> StrategyProposal:
    return StrategyProposal.model_validate(_raw(**overrides))


def test_valid_proposal_preserves_fields() -> None:
    proposal = _proposal()
    assert proposal.proposal_id == "p-1"
    assert proposal.action is ProposalAction.OPEN_LONG
    assert proposal.entry.kind is EntryKind.MARKET
    assert proposal.confidence == 0.6
    assert proposal.evidence[0].source == "news"
    assert proposal.provenance.research_thread_id == "research:1"
    assert proposal.validate_invariants() is None


def test_rejects_confidence_above_one() -> None:
    with pytest.raises(ValidationError):
        _proposal(confidence=1.5)


def test_rejects_confidence_below_zero() -> None:
    with pytest.raises(ValidationError):
        _proposal(confidence=-0.1)


def test_rejects_limit_entry_without_price() -> None:
    with pytest.raises(ValidationError):
        _proposal(entry={"kind": "limit"})


def test_accepts_limit_entry_with_price() -> None:
    proposal = _proposal(entry={"kind": "limit", "price": 101.5})
    assert proposal.entry.kind is EntryKind.LIMIT
    assert proposal.entry.price == 101.5


def test_rejects_ttl_not_after_produced() -> None:
    with pytest.raises(ValidationError):
        _proposal(expires_at=T0)


def test_rejects_empty_symbol_and_category() -> None:
    with pytest.raises(ValidationError):
        _proposal(symbol="  ")
    with pytest.raises(ValidationError):
        _proposal(category="")


def test_validate_invariants_is_the_authoritative_gate() -> None:
    # model_copy bypasses schema validators, so this exercises validate_invariants directly.
    proposal = _proposal()
    with pytest.raises(ProposalInvariantError):
        proposal.model_copy(update={"confidence": 1.5}).validate_invariants()
    with pytest.raises(ProposalInvariantError):
        proposal.model_copy(update={"expires_at": T0}).validate_invariants()
    with pytest.raises(ProposalInvariantError):
        proposal.model_copy(update={"symbol": ""}).validate_invariants()


def test_is_expired() -> None:
    proposal = _proposal()
    assert proposal.is_expired(T0) is False
    assert proposal.is_expired(T0 + timedelta(minutes=5)) is True
    assert proposal.is_expired(T0 + timedelta(minutes=6)) is True


def test_extra_fields_are_ignored() -> None:
    proposal = _proposal(suggested_qty=9999, suggested_leverage=50)
    assert "suggested_qty" not in proposal.model_dump()
    assert "suggested_leverage" not in proposal.model_dump()
