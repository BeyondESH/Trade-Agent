"""Price-alert persistence for the web API.

Simple JSON document store (data_dir/alerts/alerts.json). Thread-safe via a
lock; structure mirrors the frontend `Alert` type so both data sources
(server / local fallback) stay interchangeable.
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path

REQUIRED_FIELDS = ("symbol", "condition", "threshold")
CONDITIONS = ("above", "below")


class AlertStore:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._lock = threading.Lock()

    # -- persistence -------------------------------------------------------
    def _load(self) -> list[dict]:
        if not self.path.exists():
            return []
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return [a for a in data if isinstance(a, dict) and isinstance(a.get("id"), str)]
        except (json.JSONDecodeError, OSError):
            return []

    def _save(self, alerts: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(alerts, ensure_ascii=False, indent=2), encoding="utf-8")

    # -- API ---------------------------------------------------------------
    def list(self) -> list[dict]:
        with self._lock:
            return self._load()

    def create(self, data: dict) -> dict:
        symbol = str(data.get("symbol") or "")
        condition = data.get("condition")
        threshold = data.get("threshold")
        if not symbol:
            raise ValueError("alert.symbol is required")
        if condition not in CONDITIONS:
            raise ValueError(f"alert.condition must be one of {CONDITIONS}")
        try:
            threshold = float(threshold)
        except (TypeError, ValueError) as exc:
            raise ValueError("alert.threshold must be a number") from exc
        alert = {
            "id": uuid.uuid4().hex[:12],
            "symbol": symbol,
            "condition": condition,
            "threshold": threshold,
            "enabled": bool(data.get("enabled", True)),
            "triggered": bool(data.get("triggered", False)),
            "createdAt": int(data.get("createdAt") or time.time() * 1000),
        }
        with self._lock:
            alerts = self._load()
            alerts.insert(0, alert)
            self._save(alerts)
        return alert

    def update(self, alert_id: str, patch: dict) -> dict | None:
        with self._lock:
            alerts = self._load()
            target = next((a for a in alerts if a["id"] == alert_id), None)
            if target is None:
                return None
            if "condition" in patch and patch["condition"] not in CONDITIONS:
                raise ValueError(f"alert.condition must be one of {CONDITIONS}")
            if "threshold" in patch:
                try:
                    patch["threshold"] = float(patch["threshold"])
                except (TypeError, ValueError) as exc:
                    raise ValueError("alert.threshold must be a number") from exc
            for key in ("symbol", "condition", "threshold", "enabled", "triggered"):
                if key in patch and patch[key] is not None:
                    target[key] = patch[key]
            self._save(alerts)
            return dict(target)

    def delete(self, alert_id: str) -> bool:
        with self._lock:
            alerts = self._load()
            remaining = [a for a in alerts if a["id"] != alert_id]
            if len(remaining) == len(alerts):
                return False
            self._save(remaining)
            return True
