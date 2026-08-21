"""Backtest run history persistence.

Each completed ``/backtest`` job is stored as a record with the series
reference, request params/factors, scalar metrics, the full per-trade list and
downsampled equity/drawdown/signal/proba series (capped at
``MAX_SERIES_POINTS`` per lane). The file is bounded by ``MAX_RUNS`` with
oldest-run eviction, mirroring the ChartStore/AlertStore JSON-store pattern.
Thread-safe via a lock.
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path

import numpy as np

MAX_RUNS = 20
MAX_SERIES_POINTS = 500
MAX_TRADES = 2000

SCHEMA = "vectorbt"

SERIES_LANES = ("open_time", "equity", "drawdown", "signal", "proba", "benchmark")
SCALAR_KEYS = ("total_return", "max_drawdown", "win_rate", "trades", "bars", "test_bars")
TRADE_KEYS = ("side", "entry_time", "entry_price", "exit_time", "exit_price",
              "bars", "gross_return", "net_return")
META_KEYS = ("id", "created_at", "category", "symbol", "timeframe",
             "params", "factors", "metrics", "data_meta", "schema", "legacy")
DETAIL_KEYS = META_KEYS + ("stats", "model_metrics", "feature_weights", "roc_curve")


def downsample(values: list, max_points: int) -> list:
    """Evenly thin ``values`` to at most ``max_points`` points."""
    if len(values) <= max_points:
        return list(values)
    idx = np.linspace(0, len(values) - 1, max_points).round().astype(int)
    return [values[i] for i in idx]


def _meta(entry: dict) -> dict:
    """Lightweight metadata for the list endpoint (no stats/model_metrics)."""
    return {k: entry[k] for k in META_KEYS if k in entry}


def _detail(entry: dict) -> dict:
    """Full record for the detail endpoint, including stats/model_metrics."""
    return {k: entry[k] for k in DETAIL_KEYS if k in entry}


def _validate_entry(entry: dict) -> dict:
    """Validate shape and caps. Raises ValueError on malformed/oversized entry."""
    for key in ("id", "category", "symbol", "timeframe"):
        if not isinstance(entry.get(key), str) or not entry.get(key):
            raise ValueError(f"history entry field '{key}' must be a non-empty string")
    if not isinstance(entry.get("created_at"), int):
        raise ValueError("history entry created_at must be an int")
    if not isinstance(entry.get("params"), dict):
        raise ValueError("history entry params must be an object")
    if not isinstance(entry.get("factors"), list):
        raise ValueError("history entry factors must be a list")
    if not isinstance(entry.get("metrics"), dict):
        raise ValueError("history entry metrics must be an object")
    if not isinstance(entry.get("data_meta"), dict):
        raise ValueError("history entry data_meta must be an object")

    trade_list = entry.get("trade_list", [])
    if not isinstance(trade_list, list):
        raise ValueError("history entry trade_list must be a list")
    if len(trade_list) > MAX_TRADES:
        raise ValueError(f"too many trades per run (>{MAX_TRADES})")
    for t in trade_list:
        if not isinstance(t, dict):
            raise ValueError("each trade must be an object")
        if t.get("side") not in ("long", "short"):
            raise ValueError("each trade side must be 'long' or 'short'")
        for key in TRADE_KEYS:
            if key not in t:
                raise ValueError(f"trade missing field '{key}'")

    series = entry.get("series", {})
    if not isinstance(series, dict):
        raise ValueError("history entry series must be an object")
    for lane in SERIES_LANES:
        values = series.get(lane, [])
        if not isinstance(values, list) or len(values) > MAX_SERIES_POINTS:
            raise ValueError(f"series lane '{lane}' must be a list of <= {MAX_SERIES_POINTS}")

    return {
        "id": entry["id"],
        "created_at": entry["created_at"],
        "category": entry["category"],
        "symbol": entry["symbol"],
        "timeframe": entry["timeframe"],
        "params": entry["params"],
        "factors": entry["factors"],
        "metrics": entry["metrics"],
        "trade_list": trade_list,
        "series": series,
        "data_meta": entry["data_meta"],
        "stats": entry.get("stats") or {},
        "model_metrics": entry.get("model_metrics") or {},
        "feature_weights": entry.get("feature_weights"),
        "roc_curve": entry.get("roc_curve"),
    }


class BacktestHistoryStore:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._lock = threading.Lock()

    # -- persistence -------------------------------------------------------
    def _load(self) -> list[dict]:
        if not self.path.exists():
            return []
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(data, list):
                return []
            out = []
            for e in data:
                if not isinstance(e, dict) or not isinstance(e.get("id"), str):
                    continue
                # Records persisted by the pre-vectorbt engine carry no schema
                # marker; flag them so new UIs don't mis-render old semantics.
                if e.get("schema") != SCHEMA:
                    e = dict(e)
                    e["legacy"] = True
                out.append(e)
            return out
        except (json.JSONDecodeError, OSError):
            return []

    def _save(self, entries: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")

    # -- API ---------------------------------------------------------------
    def list(self) -> list[dict]:
        """Lightweight metadata, newest first (no trade_list/series)."""
        with self._lock:
            return [_meta(e) for e in self._load()]

    def get(self, run_id: str) -> dict | None:
        with self._lock:
            for e in self._load():
                if e["id"] == run_id:
                    return dict(e)
        return None

    def delete(self, run_id: str) -> bool:
        with self._lock:
            entries = self._load()
            remaining = [e for e in entries if e["id"] != run_id]
            if len(remaining) == len(entries):
                return False
            self._save(remaining)
            return True

    def save(self, series_ref: dict, params: dict | None, factors: list | None,
             result: dict) -> dict | None:
        """Persist a completed backtest result. Returns the metadata, or None
        when the result is an error dict (failed pipeline) — failed runs are
        not recorded. Evicts the oldest run when full."""
        if not isinstance(result, dict) or "error" in result:
            return None
        metrics = {k: result[k] for k in SCALAR_KEYS if k in result}
        series = result.get("series") or {}
        entry = _validate_entry({
            "id": uuid.uuid4().hex[:12],
            "created_at": int(time.time() * 1000),
            "category": series_ref["category"],
            "symbol": series_ref["symbol"],
            "timeframe": series_ref["timeframe"],
            "params": params or {},
            "factors": factors or [],
            "metrics": metrics,
            "trade_list": result.get("trade_list") or [],
            "series": {lane: downsample(series.get(lane, []), MAX_SERIES_POINTS)
                       for lane in SERIES_LANES},
            "data_meta": result.get("data_meta") or {},
            "stats": result.get("stats") or {},
            "model_metrics": result.get("model_metrics") or {},
            "feature_weights": result.get("feature_weights"),
            "roc_curve": result.get("roc_curve"),
            "schema": SCHEMA,
            "legacy": False,
        })
        with self._lock:
            entries = self._load()
            entries.insert(0, entry)
            entries = entries[:MAX_RUNS]
            self._save(entries)
        return _meta(entry)
