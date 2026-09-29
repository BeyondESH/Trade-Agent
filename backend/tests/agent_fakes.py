"""Deterministic fakes shared by the research / runtime tests (no LLM, no network).

``ScriptedChatModel`` replays scripted ``AIMessage`` responses and records the
tool names it is bound with, so the assembly test can prove the planning tool is
wired without a real model. ``proposal_model`` scripts a single structured-output
tool call that LangChain parses into ``structured_response``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pandas as pd
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from market_data.agent.proposal import StrategyProposal
from market_data.agent.tools import ResearchTools, build_research_tools
from market_data.config import Settings
from market_data.models import Series
from market_data.store import ParquetStore

PROPOSAL_TOOL = "StrategyProposal"


class ScriptedChatModel(BaseChatModel):
    """Replay-based chat model that accepts tool binding (returns itself)."""

    responses: list[AIMessage] = []

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools: Any, **kwargs: Any) -> ScriptedChatModel:  # noqa: ANN401
        return self

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,  # noqa: ANN401
    ) -> ChatResult:
        message = (
            self.responses.pop(0) if self.responses else AIMessage(content="research complete")
        )
        return ChatResult(generations=[ChatGeneration(message=message)])


def make_proposal(
    proposal_id: str = "p-1",
    symbol: str = "BTCUSDT",
    action: str = "open_long",
    **overrides: Any,  # noqa: ANN401
) -> StrategyProposal:
    now = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    data: dict[str, Any] = {
        "proposal_id": proposal_id,
        "produced_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=30)).isoformat(),
        "symbol": symbol,
        "category": "USDT-FUTURES",
        "timeframe": "1h",
        "action": action,
        "entry": {"kind": "market"},
        "stop_loss": 99.0,
        "confidence": 0.6,
        "horizon": "1d",
        "rationale": "momentum plus supportive news",
        "evidence": [{"source": "news", "ref": "n1"}],
        "provenance": {"model": "fake", "prompt_ver": "v1"},
    }
    data.update(overrides)
    return StrategyProposal(**data)


def proposal_message(proposal: StrategyProposal) -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[
            {"name": PROPOSAL_TOOL, "args": proposal.model_dump(mode="json"), "id": "sc-1"}
        ],
    )


def proposal_model(proposal: StrategyProposal | None = None) -> ScriptedChatModel:
    """A model that emits one valid ``StrategyProposal`` structured-output call."""
    return ScriptedChatModel(responses=[proposal_message(proposal or make_proposal())])


class FakeMcpClient:
    """Minimal MCP client stand-in exposing read + write tool names."""

    def __init__(self, names: list[str]) -> None:
        self._names = names

    def list_tools(self) -> list[str]:
        return list(self._names)

    def tool_schemas(self) -> dict[str, dict]:
        return {name: {"description": f"fake tool {name}"} for name in self._names}

    def call_tool(self, name: str, arguments: dict) -> dict:
        return {"tool": name, "arguments": arguments}


def _ok_rest(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"code": "00000", "data": {"lastPr": "100.0"}})


def seeded_store(root: Path, symbol: str = "BTCUSDT", timeframe: str = "1h") -> ParquetStore:
    """A deterministic 150-bar series so indicator/structure tools have history."""
    store = ParquetStore(root / "parquet")
    closes = np.array([100 + 5 * np.sin(i / 4.0) for i in range(150)], dtype="float64")
    frame = pd.DataFrame(
        {
            "open_time": [1_700_000_000_000 + i * 3_600_000 for i in range(len(closes))],
            "open": closes,
            "high": closes + 0.5,
            "low": closes - 0.5,
            "close": closes,
            "volume": [1.0] * len(closes),
        }
    )
    store.save(Series("USDT-FUTURES", symbol, timeframe), frame)
    return store


def fake_tools(
    settings: Settings,
    *,
    store: ParquetStore | None = None,
    mcp_names: list[str] | None = None,
) -> ResearchTools:
    """Read-only toolset wired to offline fakes (no network / npx)."""
    return build_research_tools(
        settings,
        store=store,
        news_provider=lambda hours, category: [
            {"id": "n1", "title": "BTC ETF approved", "ts": 1_800_000_000_000, "category": "crypto"}
        ],
        rest_client=httpx.Client(
            base_url="https://api.bitget.com", transport=httpx.MockTransport(_ok_rest)
        ),
        mcp_client=FakeMcpClient(mcp_names) if mcp_names is not None else None,
    )
