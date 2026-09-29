"""Tier-1 research graph assembly tests with a fake model (no network / LLM)."""

from __future__ import annotations

from pathlib import Path

from agent_fakes import fake_tools, make_proposal, proposal_model, seeded_store
from langchain.agents.middleware import TodoListMiddleware
from langgraph.graph.state import CompiledStateGraph

from market_data.agent.proposal import StrategyProposal
from market_data.agent.research import SUBAGENT_NAMES, build_research_graph, build_subagents
from market_data.config import Settings


def _graph(tmp_path: Path, model):  # noqa: ANN001, ANN202
    settings = Settings(data_dir=tmp_path)
    tools = fake_tools(settings, store=seeded_store(tmp_path))
    return build_research_graph(settings, tools=tools, model=model)


def test_build_returns_a_compiled_state_graph(tmp_path: Path) -> None:
    graph = _graph(tmp_path, proposal_model())
    assert isinstance(graph, CompiledStateGraph)
    # TodoListMiddleware is wired, so the planning node exists.
    assert any("TodoListMiddleware" in node for node in graph.nodes)


def test_planning_middleware_contributes_write_todos(tmp_path: Path) -> None:
    # The middleware we install is the one that carries the `write_todos` tool;
    # its node appearing in the compiled graph proves it is actually wired.
    middleware = TodoListMiddleware()
    assert any(getattr(candidate, "name", None) == "write_todos" for candidate in middleware.tools)
    graph = _graph(tmp_path, proposal_model())
    assert any("TodoListMiddleware" in node for node in graph.nodes)


def test_run_produces_a_valid_strategy_proposal(tmp_path: Path) -> None:
    proposal = make_proposal(proposal_id="p-assembly")
    graph = _graph(tmp_path, proposal_model(proposal))
    result = graph.invoke({"messages": [{"role": "user", "content": "research BTCUSDT"}]})
    structured = result.get("structured_response")
    assert isinstance(structured, StrategyProposal)
    assert structured.proposal_id == "p-assembly"
    assert structured.symbol == "BTCUSDT"


def test_subagents_are_the_two_phase_one_analysts(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    tools = fake_tools(settings, store=seeded_store(tmp_path))
    subagents = build_subagents(tools)
    assert {spec["name"] for spec in subagents} == set(SUBAGENT_NAMES)
    news = next(spec for spec in subagents if spec["name"] == "news-analyst")
    technical = next(spec for spec in subagents if spec["name"] == "technical-analyst")
    assert {t.name for t in news["tools"]} == {t.name for t in tools.news}
    assert {t.name for t in technical["tools"]} == {t.name for t in tools.technical_and_market}


def test_stream_events_expose_messages_and_values(tmp_path: Path) -> None:
    graph = _graph(tmp_path, proposal_model())
    methods: list[str] = []
    final_values: dict = {}
    for event in graph.stream_events(
        {"messages": [{"role": "user", "content": "research"}]}, version="v3"
    ):
        if isinstance(event, dict) and event.get("type") == "event":
            methods.append(str(event.get("method")))
            if event.get("method") == "values":
                final_values = event["params"]["data"]
    assert "values" in methods and "messages" in methods
    assert isinstance(final_values.get("structured_response"), StrategyProposal)
