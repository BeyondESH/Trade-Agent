"""Projection/audit store tests (agent-runtime, design D4), PostgreSQL-backed."""

from __future__ import annotations

from agent_fakes import make_proposal

from market_data.agent.store import ProjectionStore, proposal_meta, safe_thread_component


def test_thread_id_with_colons_roundtrips(pg_db) -> None:  # noqa: ANN001
    store = ProjectionStore(pg_db)
    thread = "research:12345:BTCUSDT"
    store.append_stream_event(thread, {"type": "done", "seq": 1})

    assert store.has_stream(thread) is True
    events, cursor = store.read_stream(thread)
    assert [event["type"] for event in events] == ["done"]
    assert cursor > 0
    # The legacy filesystem-safe mapping is retained only for the import script.
    assert safe_thread_component("exec:p-1") == "exec_p-1"


def test_proposal_roundtrip_and_filter(pg_db) -> None:  # noqa: ANN001
    store = ProjectionStore(pg_db)
    store.append_proposal(make_proposal("p-1", symbol="BTCUSDT"))
    store.append_proposal(make_proposal("p-2", symbol="ETHUSDT"))
    store.append_proposal(make_proposal("p-3", symbol="BTCUSDT"))

    stored = store.get_proposal("p-2")
    assert stored is not None and stored["symbol"] == "ETHUSDT"
    assert store.get_proposal("missing") is None

    btc = store.list_proposals(symbol="BTCUSDT")
    assert [item["proposal_id"] for item in btc] == ["p-3", "p-1"]  # newest first

    limited = store.list_proposals(limit=1)
    assert [item["proposal_id"] for item in limited] == ["p-3"]

    # `limit <= 0` yields the empty slice, matching the old file store.
    assert store.list_proposals(limit=0) == []


def test_proposal_since_ms_filter(pg_db) -> None:  # noqa: ANN001
    store = ProjectionStore(pg_db)
    proposal = make_proposal("p-old")
    store.append_proposal(proposal)
    produced_ms = int(proposal.produced_at.timestamp() * 1000)

    assert [item["proposal_id"] for item in store.list_proposals(since_ms=produced_ms)] == ["p-old"]
    assert store.list_proposals(since_ms=produced_ms + 1000) == []


def test_proposal_meta_is_trimmed(pg_db) -> None:  # noqa: ANN001
    store = ProjectionStore(pg_db)
    store.append_proposal(make_proposal("p-1"))
    stored = store.get_proposal("p-1")
    assert stored is not None
    meta = proposal_meta(stored)
    assert meta["proposal_id"] == "p-1"
    assert "rationale" not in meta and "evidence" not in meta


def test_run_roundtrip_and_kind_filter(pg_db) -> None:  # noqa: ANN001
    store = ProjectionStore(pg_db)
    store.append_run({"run_id": "exec:p-1", "kind": "execution", "status": "ok"})
    store.append_run({"run_id": "research:1", "kind": "research", "status": "failed"})

    assert store.get_run("exec:p-1")["status"] == "ok"
    assert store.get_run("nope") is None
    assert store.list_runs(limit=0) == []

    executions = store.list_runs(kind="execution")
    assert [item["run_id"] for item in executions] == ["exec:p-1"]
    assert [item["run_id"] for item in store.list_runs()] == ["research:1", "exec:p-1"]


def test_stream_cursor_returns_incremental_events(pg_db) -> None:  # noqa: ANN001
    store = ProjectionStore(pg_db)
    store.append_stream_event("research:1", {"seq": 1, "method": "values"})
    store.append_stream_event("research:1", {"seq": 2, "method": "messages"})

    first, cursor = store.read_stream("research:1")
    assert [event["seq"] for event in first] == [1, 2]
    assert cursor > 0

    # No new frames -> empty append at the same cursor.
    again, same_cursor = store.read_stream("research:1", cursor)
    assert again == [] and same_cursor == cursor

    store.append_stream_event("research:1", {"type": "done"})
    tail, final_cursor = store.read_stream("research:1", cursor)
    assert [event.get("type") for event in tail] == ["done"]
    assert final_cursor > cursor

    # A cursor past the end stays stable (already-delivered frames never replay).
    empty, past_cursor = store.read_stream("research:1", final_cursor)
    assert empty == [] and past_cursor == final_cursor


def test_stream_cursor_is_a_global_row_id_not_the_run_seq(pg_db) -> None:  # noqa: ANN001
    store = ProjectionStore(pg_db)
    # Another thread's frames advance the same global id sequence.
    store.append_stream_event("other:thread", {"type": "event", "seq": 99})
    store.append_stream_event("research:2", {"type": "event", "seq": 1})
    store.append_stream_event("research:2", {"type": "done", "seq": 2})

    first, cursor = store.read_stream("research:2")
    assert [event["seq"] for event in first] == [1, 2]
    # The cursor is the global row id (>= 3 after the other thread's row), not
    # the per-run `seq` (which tops out at 2).
    assert cursor >= 3
    # `0` means "from the beginning" for this thread, regardless of other ids.
    from_start, _ = store.read_stream("research:2", 0)
    assert [event["seq"] for event in from_start] == [1, 2]


def test_missing_stream_reads_empty(pg_db) -> None:  # noqa: ANN001
    store = ProjectionStore(pg_db)
    events, cursor = store.read_stream("research:missing")
    assert events == [] and cursor == 0
    assert store.has_stream("research:missing") is False
