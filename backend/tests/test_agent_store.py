"""Projection/audit store tests (agent-runtime, design D4)."""

from __future__ import annotations

from pathlib import Path

from agent_fakes import make_proposal

from market_data.agent.store import ProjectionStore, proposal_meta, safe_thread_component


def test_stream_path_is_windows_safe(tmp_path: Path) -> None:
    store = ProjectionStore(tmp_path / "agent")
    path = store.stream_path("research:12345:BTCUSDT")
    assert path.name == "research_12345_BTCUSDT.jsonl"
    assert ":" not in path.name
    assert safe_thread_component("exec:p-1") == "exec_p-1"


def test_proposal_roundtrip_and_filter(tmp_path: Path) -> None:
    store = ProjectionStore(tmp_path / "agent")
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


def test_proposal_meta_is_trimmed(tmp_path: Path) -> None:
    store = ProjectionStore(tmp_path / "agent")
    store.append_proposal(make_proposal("p-1"))
    meta = proposal_meta(store.get_proposal("p-1"))
    assert meta["proposal_id"] == "p-1"
    assert "rationale" not in meta and "evidence" not in meta


def test_run_roundtrip_and_kind_filter(tmp_path: Path) -> None:
    store = ProjectionStore(tmp_path / "agent")
    store.append_run({"run_id": "exec:p-1", "kind": "execution", "status": "ok"})
    store.append_run({"run_id": "research:1", "kind": "research", "status": "failed"})

    assert store.get_run("exec:p-1")["status"] == "ok"
    assert store.get_run("nope") is None

    executions = store.list_runs(kind="execution")
    assert [item["run_id"] for item in executions] == ["exec:p-1"]


def test_stream_tail_returns_incremental_events(tmp_path: Path) -> None:
    store = ProjectionStore(tmp_path / "agent")
    store.append_stream_event("research:1", {"seq": 1, "method": "values"})
    store.append_stream_event("research:1", {"seq": 2, "method": "messages"})

    first, offset = store.read_stream("research:1")
    assert [event["seq"] for event in first] == [1, 2]
    assert offset == 2

    # No new events -> empty append at the same offset.
    again, same_offset = store.read_stream("research:1", offset)
    assert again == [] and same_offset == 2

    store.append_stream_event("research:1", {"type": "done"})
    tail, final_offset = store.read_stream("research:1", offset)
    assert [event.get("type") for event in tail] == ["done"]
    assert final_offset == 3


def test_missing_stream_reads_empty(tmp_path: Path) -> None:
    store = ProjectionStore(tmp_path / "agent")
    events, total = store.read_stream("research:missing")
    assert events == [] and total == 0
