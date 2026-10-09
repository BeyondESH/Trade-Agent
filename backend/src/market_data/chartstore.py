"""Persistent chart state per series (chart terminal layout) in PostgreSQL.

Stores indicator layout, hand-drawn overlays and auto-layer toggles keyed by
``(category, symbol, timeframe)``. The public API is unchanged from the former
JSON store (``load`` / ``get`` / ``save`` with the same validation, the same
100-drawing cap and the same "missing -> empty template" behaviour); only the
medium changed - a row per series in ``chart_config`` with the opaque state kept
as ``jsonb``.

The old store had no locking at all, so two concurrent ``save`` calls clobbered
each other (lost update). The upsert below is atomic per series key, so
concurrent writes of different series no longer interfere and a same-series
write is a correct last-writer-wins.
"""

from __future__ import annotations

import json

from psycopg.types.json import Jsonb

from market_data.db import Database, get_database

MAX_DRAWINGS_PER_SERIES = 100

_EMPTY_SERIES_STATE = {
    "indicators": [],
    "drawings": [],
    "layers": {"sr": True, "structure": True, "smc": False},
}


class ChartStore:
    def __init__(self, database: Database | None = None, *, dsn: str | None = None) -> None:
        self._db = database or get_database(dsn)

    def load(self) -> dict:
        with self._db.connection() as conn:
            rows = conn.execute(
                "SELECT category, symbol, timeframe, state FROM chart_config"
            ).fetchall()
        return {
            _series_key(row["category"], row["symbol"], row["timeframe"]): row["state"]
            for row in rows
        }

    def get(self, category: str, symbol: str, timeframe: str) -> dict:
        with self._db.connection() as conn:
            row = conn.execute(
                "SELECT state FROM chart_config "
                "WHERE category = %s AND symbol = %s AND timeframe = %s",
                (category, symbol, timeframe),
            ).fetchone()
        if row is None:
            return _empty_state()
        return row["state"]

    def save(self, category: str, symbol: str, timeframe: str, state: dict) -> dict:
        validated = _validate_state(state)
        with self._db.connection() as conn:
            conn.execute(
                "INSERT INTO chart_config (category, symbol, timeframe, state) "
                "VALUES (%s, %s, %s, %s) "
                "ON CONFLICT (category, symbol, timeframe) DO UPDATE "
                "SET state = EXCLUDED.state, updated_at = now()",
                (category, symbol, timeframe, Jsonb(validated)),
            )
        return validated


def _series_key(category: str, symbol: str, timeframe: str) -> str:
    # NOT normalized on purpose: `1H` and `1h` are distinct series, matching the
    # former file-backed key exactly.
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
        raise ValueError(f"too many drawings per series (>{MAX_DRAWINGS_PER_SERIES})")
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
