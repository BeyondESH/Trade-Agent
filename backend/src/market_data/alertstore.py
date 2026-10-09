"""Price-alert persistence (PostgreSQL).

Phase 1 of the JSON -> PostgreSQL migration. The public API is unchanged -
``list`` / ``create`` / ``update`` / ``delete`` with the same validation, the
same field shape (mirroring the frontend ``Alert`` type) and the same
newest-first list order - but rows live in the ``alerts`` table instead of
``data_dir/alerts/alerts.json``.

The old implementation locked a non-atomic whole-file ``write_text``; a database
transaction now makes concurrent create/update/delete correct by construction
without changing the observable ordering (``ORDER BY seq DESC`` preserves the
former insert-at-index-0 semantics).
"""

from __future__ import annotations

import time
import uuid

from market_data.db import Database, get_database

REQUIRED_FIELDS = ("symbol", "condition", "threshold")
CONDITIONS = ("above", "below")

_COLUMNS = "id, symbol, condition, threshold, enabled, triggered, created_at, color"


def _row_to_alert(row: dict) -> dict:
    """Map a DB row to the wire shape (``createdAt`` camelCase; ``color`` optional)."""
    alert = {
        "id": row["id"],
        "symbol": row["symbol"],
        "condition": row["condition"],
        "threshold": row["threshold"],
        "enabled": row["enabled"],
        "triggered": row["triggered"],
        "createdAt": row["created_at"],
    }
    if row["color"] is not None:
        alert["color"] = row["color"]
    return alert


class AlertStore:
    def __init__(self, database: Database | None = None, *, dsn: str | None = None) -> None:
        self._db = database or get_database(dsn)

    # -- API ---------------------------------------------------------------
    def list(self) -> list[dict]:
        with self._db.connection() as conn:
            rows = conn.execute(f"SELECT {_COLUMNS} FROM alerts ORDER BY seq DESC").fetchall()
        return [_row_to_alert(row) for row in rows]

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
        color = str(data["color"]) if data.get("color") else None
        alert = {
            "id": uuid.uuid4().hex[:12],
            "symbol": symbol,
            "condition": condition,
            "threshold": threshold,
            "enabled": bool(data.get("enabled", True)),
            "triggered": bool(data.get("triggered", False)),
            "createdAt": int(data.get("createdAt") or time.time() * 1000),
        }
        with self._db.connection() as conn:
            conn.execute(
                "INSERT INTO alerts "
                "(id, symbol, condition, threshold, enabled, triggered, created_at, color) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    alert["id"],
                    alert["symbol"],
                    alert["condition"],
                    alert["threshold"],
                    alert["enabled"],
                    alert["triggered"],
                    alert["createdAt"],
                    color,
                ),
            )
        if color is not None:
            alert["color"] = color
        return alert

    def update(self, alert_id: str, patch: dict) -> dict | None:
        if "condition" in patch and patch["condition"] not in CONDITIONS:
            raise ValueError(f"alert.condition must be one of {CONDITIONS}")
        if "threshold" in patch:
            try:
                patch["threshold"] = float(patch["threshold"])
            except (TypeError, ValueError) as exc:
                raise ValueError("alert.threshold must be a number") from exc
        with self._db.connection() as conn, conn.transaction():
            row = conn.execute(
                f"SELECT {_COLUMNS} FROM alerts WHERE id = %s FOR UPDATE", (alert_id,)
            ).fetchone()
            if row is None:
                return None
            current = dict(row)
            for key in ("symbol", "condition", "threshold", "enabled", "triggered", "color"):
                if key in patch and patch[key] is not None:
                    current[key] = patch[key]
            conn.execute(
                "UPDATE alerts SET symbol = %s, condition = %s, threshold = %s, "
                "enabled = %s, triggered = %s, color = %s WHERE id = %s",
                (
                    current["symbol"],
                    current["condition"],
                    current["threshold"],
                    current["enabled"],
                    current["triggered"],
                    current["color"],
                    alert_id,
                ),
            )
            return _row_to_alert(current)

    def delete(self, alert_id: str) -> bool:
        with self._db.connection() as conn:
            row = conn.execute(
                "DELETE FROM alerts WHERE id = %s RETURNING id", (alert_id,)
            ).fetchone()
        return row is not None
