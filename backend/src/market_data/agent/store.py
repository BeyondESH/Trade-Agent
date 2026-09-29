"""Projection / audit store for the agent layer (agent-runtime, design D4).

The worker is the only writer; the FastAPI process only reads. Everything is
append-only JSONL under ``settings.agent_dir`` (stdlib ``json`` only, no new
deps):

    proposals.jsonl        one StrategyProposal per line
    runs.jsonl             research / execution run status records
    streams/<thread>.jsonl streaming events for one graph run (SSE tailed)

Thread ids contain ``:`` (e.g. ``research:123``) which is illegal in Windows
filenames, so ``stream_path`` maps a thread id to a deterministic safe name.
"""

from __future__ import annotations

import json
import re
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from market_data.agent.proposal import StrategyProposal

_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")

# Keys surfaced by the read-only proposals list endpoint.
PROPOSAL_META_KEYS: tuple[str, ...] = (
    "proposal_id",
    "symbol",
    "category",
    "timeframe",
    "action",
    "confidence",
    "produced_at",
    "expires_at",
    "horizon",
)


def safe_thread_component(thread_id: str) -> str:
    """Map a thread id to a filesystem-safe, deterministic filename stem."""
    return _UNSAFE.sub("_", thread_id).strip("_") or "unnamed"


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out: list[dict] = []
    try:
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(record, dict):
                    out.append(record)
    except OSError:
        return []
    return out


def _produced_ms(record: dict) -> int:
    raw = record.get("produced_at")
    if not isinstance(raw, str):
        return 0
    try:
        moment = datetime.fromisoformat(raw)
    except ValueError:
        return 0
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return int(moment.timestamp() * 1000)


def proposal_meta(record: dict) -> dict:
    """Trim a stored proposal record to the list-view projection."""
    return {key: record.get(key) for key in PROPOSAL_META_KEYS}


class ProjectionStore:
    """Append-only JSONL projections + stream audit (worker writes, API reads)."""

    def __init__(self, agent_dir: str | Path) -> None:
        self.root = Path(agent_dir)
        self._lock = threading.Lock()

    # -- paths -------------------------------------------------------------
    @property
    def proposals_path(self) -> Path:
        return self.root / "proposals.jsonl"

    @property
    def runs_path(self) -> Path:
        return self.root / "runs.jsonl"

    @property
    def streams_dir(self) -> Path:
        return self.root / "streams"

    def stream_path(self, thread_id: str) -> Path:
        return self.streams_dir / f"{safe_thread_component(thread_id)}.jsonl"

    # -- writes ------------------------------------------------------------
    def _append(self, path: Path, record: dict) -> dict:
        with self._lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
        return record

    def append_proposal(self, proposal: StrategyProposal) -> dict:
        return self._append(self.proposals_path, proposal.model_dump(mode="json"))

    def append_run(self, run: dict[str, Any]) -> dict:
        return self._append(self.runs_path, dict(run))

    def append_stream_event(self, thread_id: str, event: dict[str, Any]) -> dict:
        return self._append(self.stream_path(thread_id), dict(event))

    # -- reads -------------------------------------------------------------
    def list_proposals(
        self, symbol: str | None = None, limit: int = 100, since_ms: int | None = None
    ) -> list[dict]:
        """Newest-first stored proposals, optionally filtered by symbol / time."""
        items = _read_jsonl(self.proposals_path)
        if symbol:
            items = [item for item in items if item.get("symbol") == symbol]
        if since_ms is not None:
            items = [item for item in items if _produced_ms(item) >= since_ms]
        if limit is not None:
            items = items[-limit:] if limit > 0 else []
        return list(reversed(items))

    def get_proposal(self, proposal_id: str) -> dict | None:
        for item in reversed(_read_jsonl(self.proposals_path)):
            if item.get("proposal_id") == proposal_id:
                return item
        return None

    def list_runs(self, kind: str | None = None, limit: int = 100) -> list[dict]:
        items = _read_jsonl(self.runs_path)
        if kind:
            items = [item for item in items if item.get("kind") == kind]
        if limit is not None:
            items = items[-limit:] if limit > 0 else []
        return list(reversed(items))

    def get_run(self, run_id: str) -> dict | None:
        for item in reversed(_read_jsonl(self.runs_path)):
            if item.get("run_id") == run_id:
                return item
        return None

    def read_stream(self, thread_id: str, offset: int = 0) -> tuple[list[dict], int]:
        """Return ``(events_from_offset, total)``; caller passes the new total back."""
        events = _read_jsonl(self.stream_path(thread_id))
        start = max(0, offset)
        return events[start:], len(events)
