"""Persistent chart state per series (chart terminal layout).

Stores indicator layout, hand-drawn overlays and auto-layer toggles keyed by
`category/symbol/timeframe` in a local JSON file (parallel to appconfig).
Writes are lightly validated and capped to keep the file bounded.
"""

from __future__ import annotations

import json
from pathlib import Path

MAX_DRAWINGS_PER_SERIES = 100

_EMPTY_SERIES_STATE = {
    "indicators": [],
    "drawings": [],
    "layers": {"sr": True, "structure": True, "smc": False},
}


class ChartStore:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def load(self) -> dict:
        if not self.path.exists():
            return {}
        data = json.loads(self.path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}

    def get(self, category: str, symbol: str, timeframe: str) -> dict:
        return self.load().get(_series_key(category, symbol, timeframe), _empty_state())

    def save(self, category: str, symbol: str, timeframe: str, state: dict) -> dict:
        validated = _validate_state(state)
        data = self.load()
        data[_series_key(category, symbol, timeframe)] = validated
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return validated


def _series_key(category: str, symbol: str, timeframe: str) -> str:
    return f"{category}/{symbol}/{timeframe}"


def _empty_state() -> dict:
    return json.loads(json.dumps(_EMPTY_SERIES_STATE))


def _validate_state(state: dict) -> dict:
    """Validate shape and caps. Raises ValueError on malformed/oversized state."""
    if not isinstance(state, dict):
        raise ValueError("chart state must be an object")

    indicators = state.get("indicators", [])
    if not isinstance(indicators, list):
        raise ValueError("indicators must be a list")
    for ind in indicators:
        if not isinstance(ind, dict) or not isinstance(ind.get("name"), str):
            raise ValueError("each indicator must have a name")
        pane = ind.get("pane", "sub")
        if pane not in ("candle", "sub"):
            raise ValueError(f"invalid indicator pane: {pane}")

    drawings = state.get("drawings", [])
    if not isinstance(drawings, list):
        raise ValueError("drawings must be a list")
    if len(drawings) > MAX_DRAWINGS_PER_SERIES:
        raise ValueError(
            f"too many drawings per series (>{MAX_DRAWINGS_PER_SERIES})"
        )
    for d in drawings:
        if not isinstance(d, dict) or not isinstance(d.get("name"), str):
            raise ValueError("each drawing must have a name")

    layers = state.get("layers", _EMPTY_SERIES_STATE["layers"])
    if not isinstance(layers, dict):
        raise ValueError("layers must be an object")
    for key in ("sr", "structure", "smc"):
        if key in layers and not isinstance(layers[key], bool):
            raise ValueError(f"layer {key} must be a boolean")

    return {
        "indicators": indicators,
        "drawings": drawings,
        "layers": layers,
    }
