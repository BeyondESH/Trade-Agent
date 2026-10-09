"""Offline tests for the bounded PostgreSQL event log.

Run:
    pytest tests/test_events.py
"""

from __future__ import annotations

import pytest

from market_data.events import EventLog

pytestmark = pytest.mark.db


def test_append_and_list_roundtrip(pg_db) -> None:  # noqa: ANN001
    log = EventLog(pg_db)
    first = log.append("circuit_breaker", {"action": "blocked", "drawdown": 0.15})
    second = log.append("circuit_breaker", {"action": "enforced", "symbols": ["BTCUSDT"]})
    assert first["id"] != second["id"]
    assert first["kind"] == "circuit_breaker" and isinstance(first["ts"], int)
    events = log.list()
    assert [e["id"] for e in events] == [first["id"], second["id"]]
    assert events[0]["payload"]["action"] == "blocked"
    assert events[1]["payload"]["symbols"] == ["BTCUSDT"]


def test_persists_across_instances(pg_db) -> None:  # noqa: ANN001
    EventLog(pg_db).append("circuit_breaker", {"action": "blocked"})
    reloaded = EventLog(pg_db).list()
    assert len(reloaded) == 1 and reloaded[0]["payload"]["action"] == "blocked"


def test_overflow_evicts_oldest(pg_db) -> None:  # noqa: ANN001
    log = EventLog(pg_db, max_events=3)
    appended = [log.append("tick", {"n": i}) for i in range(5)]
    kept = log.list()
    assert [e["id"] for e in kept] == [e["id"] for e in appended[-3:]]
    assert [e["payload"]["n"] for e in kept] == [2, 3, 4]


def test_cap_is_per_source(pg_db) -> None:  # noqa: ANN001
    log = EventLog(pg_db, max_events=2)
    for i in range(3):
        log.append("a", {"n": i})
    log.append("b", {"n": 99})
    assert [e["payload"]["n"] for e in log.list(kind="a")] == [1, 2]
    assert [e["payload"]["n"] for e in log.list(kind="b")] == [99]


def test_list_filters_by_kind(pg_db) -> None:  # noqa: ANN001
    log = EventLog(pg_db)
    log.append("circuit_breaker", {"action": "blocked"})
    log.append("other", {"x": 1})
    log.append("circuit_breaker", {"action": "enforced"})
    assert len(log.list()) == 3
    only = log.list(kind="circuit_breaker")
    assert [e["payload"]["action"] for e in only] == ["blocked", "enforced"]


def test_list_limit_returns_newest(pg_db) -> None:  # noqa: ANN001
    log = EventLog(pg_db)
    for i in range(4):
        log.append("tick", {"n": i})
    assert [e["payload"]["n"] for e in log.list(limit=2)] == [2, 3]


if __name__ == "__main__":
    import sys

    sys.exit(pytest.main([__file__, "-v"]))
