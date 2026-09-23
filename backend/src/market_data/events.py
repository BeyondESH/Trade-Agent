"""Bounded append-only JSONL event log (circuit-breaker events).

One JSON object per line, following the ``TradeJournal`` append-only JSONL
convention. Each event carries ``id``/``ts``/``kind``/``payload``. The log is
bounded by ``max_events``: appending past the cap rewrites the file keeping only
the newest entries, so the log itself cannot become a new unbounded growth
source. Reads are best-effort (malformed lines are skipped) and the store is
thread-safe via a lock, mirroring AlertStore/BacktestHistoryStore.
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path

DEFAULT_MAX_EVENTS = 200


class EventLog:
    def __init__(self, path: str | Path, max_events: int = DEFAULT_MAX_EVENTS) -> None:
        self.path = Path(path)
        self.max_events = max(1, int(max_events))
        self._lock = threading.Lock()

    # -- persistence -------------------------------------------------------
    def _load(self) -> list[dict]:
        if not self.path.exists():
            return []
        out: list[dict] = []
        try:
            with self.path.open(encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(entry, dict) and isinstance(entry.get("id"), str):
                        out.append(entry)
        except OSError:
            return []
        return out

    def _rewrite(self, entries: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        body = "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in entries)
        self.path.write_text(body, encoding="utf-8")

    # -- API ---------------------------------------------------------------
    def append(self, kind: str, payload: dict | None = None) -> dict:
        entry = {
            "id": uuid.uuid4().hex[:12],
            "ts": int(time.time() * 1000),
            "kind": str(kind),
            "payload": payload or {},
        }
        with self._lock:
            entries = self._load()
            entries.append(entry)
            if len(entries) > self.max_events:
                # Overflow: rewrite keeping only the newest N (oldest evicted).
                self._rewrite(entries[-self.max_events :])
            else:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                with self.path.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return entry

    def list(self, kind: str | None = None, limit: int = 100) -> list[dict]:
        """Read events oldest-first; ``limit`` caps to the newest N (None = all)."""
        with self._lock:
            entries = self._load()
        if kind is not None:
            entries = [e for e in entries if e.get("kind") == kind]
        if limit is not None:
            entries = entries[-limit:] if limit > 0 else []
        return entries
