"""The single cross-layer contract: a strongly-typed ``StrategyProposal``.

Tier 1 (LLM research) emits this via deepagents' ``response_format``; Tier 2
(deterministic execution) re-validates it independently before any order. This
module is pure data + validation: no trading logic, no I/O, no LLM imports.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ProposalAction(StrEnum):
    """Directional intent of a proposal."""

    OPEN_LONG = "open_long"
    OPEN_SHORT = "open_short"
    CLOSE = "close"
    FLAT = "flat"


class EntryKind(StrEnum):
    """Order execution style."""

    MARKET = "market"
    LIMIT = "limit"


class ProposalInvariantError(ValueError):
    """Raised when a proposal violates a cross-field invariant."""


class Entry(BaseModel):
    """How the proposal wants to enter (price is mandatory for ``limit``)."""

    model_config = ConfigDict(frozen=True)

    kind: EntryKind
    price: float | None = None


class EvidenceRef(BaseModel):
    """A traceable pointer back to the research that produced the proposal."""

    model_config = ConfigDict(frozen=True)

    source: str
    ref: str = ""
    note: str = ""


class Provenance(BaseModel):
    """Who/what produced the proposal (for audit; required on persistence)."""

    model_config = ConfigDict(frozen=True)

    model: str = ""
    prompt_ver: str = ""
    research_thread_id: str = ""


class StrategyProposal(BaseModel):
    """Research output contract with a TTL and independently verifiable invariants.

    Unknown fields are ignored on purpose: an LLM may volunteer a position size or
    leverage, and the execution layer must discard it (sizing is deterministic).
    """

    model_config = ConfigDict(frozen=True, extra="ignore")

    proposal_id: str
    produced_at: datetime
    expires_at: datetime
    symbol: str
    category: str
    timeframe: str
    action: ProposalAction
    entry: Entry
    stop_loss: float | None = None
    take_profit: float | None = None
    confidence: float
    horizon: str
    rationale: str
    evidence: list[EvidenceRef] = Field(default_factory=list)
    provenance: Provenance = Field(default_factory=Provenance)

    @field_validator("produced_at", "expires_at")
    @classmethod
    def _to_utc(cls, value: datetime) -> datetime:
        """Normalise to timezone-aware UTC so TTL comparisons never mix tz."""
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def _enforce_invariants(self) -> StrategyProposal:
        self.validate_invariants()
        return self

    def validate_invariants(self) -> None:
        """Enforce every cross-field invariant; raise ``ProposalInvariantError``.

        Called automatically on construction (so ``model_validate`` also gates),
        and explicitly by the execution layer before acting on a proposal.
        """
        if not 0.0 <= self.confidence <= 1.0:
            raise ProposalInvariantError(f"confidence out of [0,1]: {self.confidence}")
        if not self.symbol.strip():
            raise ProposalInvariantError("symbol must be non-empty")
        if not self.category.strip():
            raise ProposalInvariantError("category must be non-empty")
        if self.expires_at <= self.produced_at:
            raise ProposalInvariantError(
                f"expires_at ({self.expires_at.isoformat()}) must be after "
                f"produced_at ({self.produced_at.isoformat()})"
            )
        if self.entry.kind is EntryKind.LIMIT and self.entry.price is None:
            raise ProposalInvariantError("limit entry requires a price")

    def is_expired(self, now: datetime | None = None) -> bool:
        """True when the proposal's TTL has elapsed (execution must fail-closed)."""
        moment = now if now is not None else datetime.now(UTC)
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=UTC)
        return moment >= self.expires_at
