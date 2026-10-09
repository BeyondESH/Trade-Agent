"""One-shot migration: LangGraph checkpoints from the legacy SQLite saver to PostgreSQL.

Reads every row of the old SQLite ``checkpoints`` + ``writes`` tables and writes
them through the Postgres saver, which splits each checkpoint into
``checkpoints`` / ``checkpoint_blobs`` / ``checkpoint_writes`` the same way a live
write does. Idempotent: a second run upserts/ignores and never duplicates rows.
The SQLite file is only ever opened read-only — never modified or deleted — so the
migration can be re-run and audited.

Usage::

    python scripts/migrate_checkpoints_sqlite_to_pg.py [--dry-run] [--sqlite PATH] [--dsn DSN]
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

import psycopg
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from psycopg.rows import dict_row

from market_data.config import get_settings

_INSERT_WRITE_SQL = """
    INSERT INTO checkpoint_writes
        (thread_id, checkpoint_ns, checkpoint_id, task_id, task_path, idx, channel, type, blob)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id, task_id, idx) DO NOTHING
"""


def _count(conn: psycopg.Connection, table: str) -> int:
    row = conn.execute(f"SELECT count(*) AS n FROM {table}").fetchone()
    assert row is not None
    return int(row["n"])


def _read_sqlite(path: Path) -> tuple[list[sqlite3.Row], list[sqlite3.Row]]:
    src = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    src.row_factory = sqlite3.Row
    try:
        checkpoints = src.execute(
            "SELECT thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, "
            "type, checkpoint, metadata FROM checkpoints"
        ).fetchall()
        writes = src.execute(
            "SELECT thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, "
            "type, value FROM writes"
        ).fetchall()
    finally:
        src.close()
    return list(checkpoints), list(writes)


def _copy_checkpoint(saver: PostgresSaver, serde: JsonPlusSerializer, row: sqlite3.Row) -> None:
    checkpoint = serde.loads_typed((row["type"], row["checkpoint"]))
    metadata = json.loads(row["metadata"]) if row["metadata"] is not None else {}
    configurable: dict[str, Any] = {
        "thread_id": row["thread_id"],
        "checkpoint_ns": row["checkpoint_ns"],
    }
    if row["parent_checkpoint_id"]:
        configurable["checkpoint_id"] = row["parent_checkpoint_id"]
    saver.put({"configurable": configurable}, checkpoint, metadata, checkpoint["channel_versions"])


def migrate(sqlite_path: Path, dsn: str, *, dry_run: bool) -> int:
    if not sqlite_path.exists():
        print(f"[migrate] no SQLite checkpoint file at {sqlite_path}; nothing to do.")
        return 0

    checkpoints, writes = _read_sqlite(sqlite_path)
    thread_ids = sorted({r["thread_id"] for r in checkpoints} | {r["thread_id"] for r in writes})
    print(f"[migrate] sqlite {sqlite_path}")
    print(f"[migrate] read {len(checkpoints)} checkpoint row(s), {len(writes)} write row(s)")
    print(f"[migrate] thread_ids: {', '.join(thread_ids) or '(none)'}")

    if dry_run:
        print("[migrate] --dry-run: nothing written to Postgres.")
        return 0

    serde = JsonPlusSerializer()
    with psycopg.connect(dsn, autocommit=True, prepare_threshold=0, row_factory=dict_row) as conn:
        saver = PostgresSaver(conn)
        saver.setup()
        before_cp = _count(conn, "checkpoints")
        before_w = _count(conn, "checkpoint_writes")
        for row in checkpoints:
            _copy_checkpoint(saver, serde, row)
        for row in writes:
            conn.execute(
                _INSERT_WRITE_SQL,
                (
                    row["thread_id"],
                    row["checkpoint_ns"],
                    row["checkpoint_id"],
                    row["task_id"],
                    "",
                    row["idx"],
                    row["channel"],
                    row["type"],
                    row["value"],
                ),
            )
        after_cp = _count(conn, "checkpoints")
        after_w = _count(conn, "checkpoint_writes")

    print(
        f"[migrate] postgres checkpoints {before_cp} -> {after_cp} (+{after_cp - before_cp}), "
        f"checkpoint_writes {before_w} -> {after_w} (+{after_w - before_w})"
    )
    print("[migrate] done (idempotent: re-running inserts no duplicates).")
    return 0


def main(argv: list[str] | None = None) -> int:
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, default=settings.agent_checkpoint_path)
    parser.add_argument("--dsn", default=settings.postgres_dsn)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    return migrate(args.sqlite, args.dsn, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
