"""Graph-run stream capture: persist ``stream_events(v3)`` to a thread's JSONL.

The worker drives each graph run through this helper so the FastAPI process can
tail a finished/live run without ever touching LangGraph. Payloads are normalised
to JSON-safe data here (LangChain messages, pydantic models) so the reader stays
a plain ``json.loads``.
"""

from __future__ import annotations

import logging
from typing import Any

from market_data.agent.store import ProjectionStore

logger = logging.getLogger(__name__)


def jsonable(value: Any) -> Any:  # noqa: ANN401 - recursive normalizer
    """Convert stream payloads (messages, pydantic, dataclasses) to JSON-safe."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [jsonable(item) for item in value]
    dump = getattr(value, "model_dump", None)
    if callable(dump):
        try:
            return jsonable(dump(mode="json"))
        except Exception:  # noqa: BLE001 - fall through to a string form
            pass
    return str(value)


def capture_stream(
    graph: Any, thread_id: str, payload: dict, store: ProjectionStore
) -> dict | None:
    """Run one graph, persisting every event; return the last ``values`` state.

    Always terminates the thread's stream file with a ``done`` (or ``error``)
    frame so a tailing SSE client knows when to stop. A failed run returns
    ``None`` and never propagates.
    """
    config = {"configurable": {"thread_id": thread_id}}
    seq = 0
    final: dict | None = None
    try:
        for event in graph.stream_events(payload, config, version="v3"):
            if not isinstance(event, dict):
                continue
            method = event.get("method")
            params = event.get("params") or {}
            seq += 1
            store.append_stream_event(
                thread_id,
                {
                    "type": "event",
                    "seq": seq,
                    "method": method,
                    "namespace": params.get("namespace", []),
                    "data": jsonable(params.get("data")),
                },
            )
            if method == "values" and isinstance(params.get("data"), dict):
                final = params["data"]
        store.append_stream_event(thread_id, {"type": "done", "seq": seq + 1})
        return final
    except Exception as exc:  # noqa: BLE001 - a bad run never kills the loop
        logger.warning("graph run %s failed: %s", thread_id, exc)
        store.append_stream_event(thread_id, {"type": "error", "reason": str(exc)})
        return None
