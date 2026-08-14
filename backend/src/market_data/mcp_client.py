"""MCP data client bridge (tasks 2.1, 2.2, 2.4).

Launches `bitget-agent-mcp` as a stdio subprocess and exposes synchronous
helpers on top of the async `mcp` Python SDK.

The persistent session is driven by a single long-lived task on a background
event loop (an "actor"): requests are queued and executed inside that task, so
the anyio task-group / cancel scopes are always entered *and* exited in the same
task (per design D1: connection reuse without cross-task teardown errors).
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
import shutil
import subprocess
import threading
from contextlib import AsyncExitStack
from typing import Any, Awaitable, Callable

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

logger = logging.getLogger(__name__)

MIN_NODE_MAJOR = 20

Op = Callable[[ClientSession], Awaitable[Any]]


async def _op_with_retry(
    op: Op,
    session: ClientSession,
    reconnect: Callable[[], Awaitable[ClientSession]],
) -> tuple[Any, ClientSession]:
    """Run `op(session)`, retrying once on a fresh session after `reconnect()`.

    Returns (result, session) where session may be the reconnected one.
    """
    try:
        return await op(session), session
    except Exception as first:  # noqa: BLE001 - transport-level failure -> reconnect
        logger.warning("MCP op failed (%s); reconnecting once.", first)
        session = await reconnect()
        return await op(session), session


class McpError(RuntimeError):
    """Raised for MCP bridge failures (startup, transport, tool call)."""


def check_node_version(minimum_major: int = MIN_NODE_MAJOR) -> None:
    """Verify Node.js >= minimum_major is available (task 2.2)."""
    node = shutil.which("node")
    if node is None:
        raise McpError(
            f"Node.js >= {minimum_major} is required to run bitget-agent-mcp, "
            "but `node` was not found on PATH."
        )
    try:
        raw = subprocess.run(
            [node, "--version"], capture_output=True, text=True, timeout=10, check=True
        ).stdout.strip()
    except (subprocess.SubprocessError, OSError) as exc:
        raise McpError(f"Failed to determine Node.js version: {exc}") from exc

    major = int(raw.lstrip("v").split(".", 1)[0])
    if major < minimum_major:
        raise McpError(
            f"Node.js >= {minimum_major} required, found {raw}. Please upgrade Node.js."
        )
    logger.info("Node.js %s detected (>= %d required).", raw, minimum_major)


class McpDataClient:
    """Synchronous facade over a persistent, single-task MCP stdio session."""

    def __init__(
        self,
        command: str,
        args: list[str],
        *,
        timeout: float = 60.0,
        env: dict[str, str] | None = None,
    ) -> None:
        self._params = StdioServerParameters(command=command, args=list(args), env=env)
        self._timeout = timeout
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._queue: asyncio.Queue | None = None
        self._runner: concurrent.futures.Future | None = None
        self._ready = threading.Event()
        self._start_error: BaseException | None = None
        self._lock = threading.Lock()

    # -- lifecycle ---------------------------------------------------------
    def start(self) -> None:
        with self._lock:
            if self._loop is not None:
                return
            check_node_version()
            self._loop = asyncio.new_event_loop()
            self._thread = threading.Thread(target=self._loop.run_forever, daemon=True)
            self._thread.start()
            self._runner = asyncio.run_coroutine_threadsafe(self._run(), self._loop)
            if not self._ready.wait(timeout=self._timeout) and self._start_error is None:
                raise McpError("Timed out establishing MCP session.")
            if self._start_error is not None:
                raise McpError(f"Failed to establish MCP session: {self._start_error}")
            logger.info("MCP session established via %s.", self._params.command)

    async def _connect(self, stack: AsyncExitStack) -> ClientSession:
        read, write = await stack.enter_async_context(stdio_client(self._params))
        session = await stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        return session

    async def _run(self) -> None:
        self._queue = asyncio.Queue()
        stack = AsyncExitStack()

        async def reconnect() -> ClientSession:
            nonlocal stack
            await stack.aclose()
            stack = AsyncExitStack()
            await stack.__aenter__()
            return await self._connect(stack)

        try:
            await stack.__aenter__()
            session = await self._connect(stack)
            self._ready.set()
            while True:
                item = await self._queue.get()
                if item is None:
                    break
                op, fut = item
                try:
                    result, session = await _op_with_retry(op, session, reconnect)
                except Exception as exc:  # noqa: BLE001 - surface to caller's future
                    fut.set_exception(exc)
                    continue
                fut.set_result(result)
        except BaseException as exc:  # noqa: BLE001 - surface startup failure to start()
            self._start_error = exc
            self._ready.set()
        finally:
            await stack.aclose()

    def close(self) -> None:
        with self._lock:
            if self._loop is None:
                return
            try:
                if self._queue is not None:
                    self._loop.call_soon_threadsafe(self._queue.put_nowait, None)
                if self._runner is not None:
                    self._runner.result(timeout=self._timeout)
            except Exception:  # noqa: BLE001 - best-effort teardown
                logger.warning("Error during MCP session teardown.", exc_info=True)
            finally:
                self._loop.call_soon_threadsafe(self._loop.stop)
                if self._thread is not None:
                    self._thread.join(timeout=self._timeout)
                self._loop.close()
                self._loop = self._thread = self._queue = self._runner = None
                self._ready.clear()

    def __enter__(self) -> "McpDataClient":
        self.start()
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    # -- request plumbing --------------------------------------------------
    def _submit(self, op: Op) -> Any:
        if self._loop is None or self._queue is None:
            raise McpError("MCP client not started; call start() first.")
        fut: concurrent.futures.Future = concurrent.futures.Future()
        self._loop.call_soon_threadsafe(self._queue.put_nowait, (op, fut))
        return fut.result(timeout=self._timeout)

    # -- public API --------------------------------------------------------
    def list_tools(self) -> list[str]:
        result = self._submit(lambda s: s.list_tools())
        return [tool.name for tool in result.tools]

    def tool_schemas(self) -> dict[str, Any]:
        result = self._submit(lambda s: s.list_tools())
        return {tool.name: getattr(tool, "inputSchema", None) for tool in result.tools}

    def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        result = self._submit(lambda s: s.call_tool(name, arguments))
        return self._extract_payload(result)

    @staticmethod
    def _extract_payload(result: Any) -> Any:
        """Extract JSON payload from an MCP CallToolResult."""
        if getattr(result, "isError", False):
            raise McpError(f"MCP tool returned an error: {result}")

        structured = getattr(result, "structuredContent", None)
        if structured:
            return structured

        texts: list[str] = []
        for block in getattr(result, "content", []) or []:
            text = getattr(block, "text", None)
            if text:
                texts.append(text)
        if not texts:
            return None
        joined = "\n".join(texts)
        try:
            return json.loads(joined)
        except json.JSONDecodeError:
            return joined
