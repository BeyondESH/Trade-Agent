"""Offline tests for the read-only agent projection endpoints.

The FastAPI process only reads worker-written JSONL projections; these tests
inject a seeded `ProjectionStore` so no worker, LLM or network is involved.
"""

from __future__ import annotations

from pathlib import Path

from agent_fakes import make_proposal
from fastapi.testclient import TestClient

from market_data.agent.store import ProjectionStore
from market_data.config import Settings
from market_data.webapi import create_app


def _client(tmp_path: Path) -> TestClient:
    settings = Settings(data_dir=tmp_path)
    store = ProjectionStore(settings.agent_dir)
    store.append_proposal(make_proposal("p-1", symbol="BTCUSDT"))
    store.append_proposal(make_proposal("p-2", symbol="ETHUSDT"))
    store.append_run({"run_id": "exec:p-1", "kind": "execution", "status": "ok", "reason": ""})
    store.append_stream_event("research:1", {"type": "event", "seq": 1, "method": "values"})
    store.append_stream_event("research:1", {"type": "done", "seq": 2})
    return TestClient(create_app(settings, projection_store=store))


def test_proposals_list_and_symbol_filter(tmp_path: Path) -> None:
    client = _client(tmp_path)
    all_items = client.get("/research/proposals").json()["proposals"]
    assert {item["proposal_id"] for item in all_items} == {"p-1", "p-2"}
    assert "rationale" not in all_items[0]

    only_btc = client.get("/research/proposals", params={"symbol": "BTCUSDT"}).json()["proposals"]
    assert [item["proposal_id"] for item in only_btc] == ["p-1"]


def test_proposal_detail_and_404(tmp_path: Path) -> None:
    client = _client(tmp_path)
    r = client.get("/research/proposals/p-1")
    assert r.status_code == 200
    assert r.json()["symbol"] == "BTCUSDT"
    assert client.get("/research/proposals/missing").status_code == 404


def test_execution_detail_and_404(tmp_path: Path) -> None:
    client = _client(tmp_path)
    r = client.get("/executions/exec:p-1")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert client.get("/executions/missing").status_code == 404


def test_research_stream_emits_events_until_done(tmp_path: Path) -> None:
    client = _client(tmp_path)
    with client.stream("GET", "/research/research:1/stream") as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        body = "".join(r.iter_text())
    assert '"seq": 1' in body and '"type": "done"' in body


def test_research_stream_missing_thread_is_404(tmp_path: Path) -> None:
    client = _client(tmp_path)
    assert client.get("/research/missing:thread/stream").status_code == 404
