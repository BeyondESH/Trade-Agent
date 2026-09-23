"""Offline tests for the bounded JSONL event log.

Run:
    python tests/test_events.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import json

from market_data.events import EventLog


def test_append_and_list_roundtrip(tmp_path) -> None:  # noqa: ANN001
    log = EventLog(tmp_path / "events" / "log.jsonl")
    first = log.append("circuit_breaker", {"action": "blocked", "drawdown": 0.15})
    second = log.append("circuit_breaker", {"action": "enforced", "symbols": ["BTCUSDT"]})
    assert first["id"] != second["id"]
    assert first["kind"] == "circuit_breaker" and isinstance(first["ts"], int)
    events = log.list()
    assert [e["id"] for e in events] == [first["id"], second["id"]]
    assert events[0]["payload"]["action"] == "blocked"
    assert events[1]["payload"]["symbols"] == ["BTCUSDT"]


def test_persists_across_instances(tmp_path) -> None:  # noqa: ANN001
    path = tmp_path / "log.jsonl"
    EventLog(path).append("circuit_breaker", {"action": "blocked"})
    reloaded = EventLog(path).list()
    assert len(reloaded) == 1 and reloaded[0]["payload"]["action"] == "blocked"


def test_overflow_evicts_oldest(tmp_path) -> None:  # noqa: ANN001
    path = tmp_path / "log.jsonl"
    log = EventLog(path, max_events=3)
    appended = [log.append("tick", {"n": i}) for i in range(5)]
    kept = log.list()
    assert [e["id"] for e in kept] == [e["id"] for e in appended[-3:]]
    assert [e["payload"]["n"] for e in kept] == [2, 3, 4]
    # File itself is bounded (one JSON object per line).
    lines = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(lines) == 3
    assert all(isinstance(json.loads(line), dict) for line in lines)


def test_list_filters_by_kind(tmp_path) -> None:  # noqa: ANN001
    log = EventLog(tmp_path / "log.jsonl")
    log.append("circuit_breaker", {"action": "blocked"})
    log.append("other", {"x": 1})
    log.append("circuit_breaker", {"action": "enforced"})
    assert len(log.list()) == 3
    only = log.list(kind="circuit_breaker")
    assert [e["payload"]["action"] for e in only] == ["blocked", "enforced"]


def test_list_limit_returns_newest(tmp_path) -> None:  # noqa: ANN001
    log = EventLog(tmp_path / "log.jsonl")
    for i in range(4):
        log.append("tick", {"n": i})
    assert [e["payload"]["n"] for e in log.list(limit=2)] == [2, 3]


def test_load_skips_corrupt_lines(tmp_path) -> None:  # noqa: ANN001
    path = tmp_path / "log.jsonl"
    path.write_text(
        '{"id": "abc", "ts": 1, "kind": "k", "payload": {}}\nnot json\n', encoding="utf-8"
    )
    log = EventLog(path)
    log.append("k", {"n": 1})
    assert [e["payload"] for e in log.list()] == [{}, {"n": 1}]
