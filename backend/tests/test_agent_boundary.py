"""Determinism boundary: the execution layer must stay free of LLM / network code.

This is the CI gate that turns "Tier 2 is deterministic" from a verbal promise
into an enforced contract (design decision 3).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from types import ModuleType

from market_data.agent import broker as broker_module
from market_data.agent import execution as execution_module

BOUNDARY_MODULES: tuple[ModuleType, ...] = (execution_module, broker_module)

# Any of these in the deterministic layer means the boundary has rotted.
FORBIDDEN_LLM_TOKENS = (
    "deepagents",
    "create_deep_agent",
    "create_agent",
    "langchain",
    "chat_models",
    "ChatAnthropic",
    "ChatOpenAI",
    "anthropic",
    "openai",
)

# No real exchange / HTTP path may exist in the deterministic layer.
FORBIDDEN_NETWORK_TOKENS = (
    "httpx",
    "requests",
    "aiohttp",
    "websocket",
    "urllib.request",
)


def _read_source(module: ModuleType) -> str:
    assert module.__file__ is not None
    return Path(module.__file__).read_text(encoding="utf-8")


def test_no_llm_tokens_in_execution_or_broker() -> None:
    for module in BOUNDARY_MODULES:
        source = _read_source(module)
        lowered = source.lower()
        for token in FORBIDDEN_LLM_TOKENS:
            assert token.lower() not in lowered, f"{module.__name__} references {token!r}"


def test_no_network_tokens_in_execution_or_broker() -> None:
    for module in BOUNDARY_MODULES:
        source = _read_source(module).lower()
        for token in FORBIDDEN_NETWORK_TOKENS:
            assert token.lower() not in source, f"{module.__name__} references {token!r}"


def test_importing_boundary_does_not_pull_an_llm_framework() -> None:
    backend_root = Path(__file__).resolve().parents[1]
    code = (
        "import sys; "
        "import market_data.agent.execution, market_data.agent.broker; "
        "loaded = {m for m in sys.modules if m.split('.')[0] in {'deepagents', 'langchain'}}; "
        "print(sorted(loaded))"
    )
    proc = subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(backend_root),
        capture_output=True,
        text=True,
        check=True,
    )
    assert proc.stdout.strip() == "[]", proc.stdout


# The FastAPI process must stay LLM-free: it may read the worker's projections
# but never import a model/agent framework (design decision 1 / agent-runtime).
LLM_ROOTS = {
    "deepagents",
    "langchain",
    "langchain_core",
    "langchain_anthropic",
    "anthropic",
    "openai",
}


def test_importing_webapi_does_not_pull_an_llm_framework() -> None:
    backend_root = Path(__file__).resolve().parents[1]
    code = (
        "import sys; "
        "import market_data.webapi; "
        f"loaded = {{m for m in sys.modules if m.split('.')[0] in {LLM_ROOTS!r}}}; "
        "print(sorted(loaded))"
    )
    proc = subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(backend_root),
        capture_output=True,
        text=True,
        check=True,
    )
    assert proc.stdout.strip() == "[]", proc.stdout
