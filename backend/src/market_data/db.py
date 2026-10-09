"""PostgreSQL access layer: a shared connection pool + idempotent schema bootstrap.

Phases 1-2 of the "all persistence -> PostgreSQL" migration. This is the single
place that owns the connection lifecycle and the DDL, so the formerly
file-backed stores (alerts, chart config, BlockBeats cache, event log) and the
formerly Parquet-backed OHLCV candle store can share one pool instead of each
opening its own connection or writing its own file.

Design decisions
----------------
* **Pooling.** One ``psycopg_pool.ConnectionPool`` per DSN is shared
  process-wide. FastAPI runs the synchronous route handlers in an anyio worker
  thread, so a thread-safe pool (not a single connection) is required, and a
  pool avoids connect-per-request. The agent worker is a separate process and,
  by construction, gets its own pool.
* **Bootstrap locking.** The schema is created inside one transaction guarded by
  ``pg_advisory_xact_lock`` so several processes booting at the same time
  (FastAPI + worker + import scripts) serialise their DDL instead of racing
  ``CREATE TABLE IF NOT EXISTS`` (which can still raise ``duplicate_table`` under
  concurrency). The lock is transaction-scoped and released automatically.
* **Unreachable database.** ``bootstrap()``/``connection()`` raise
  ``DatabaseUnavailable`` rather than silently degrading to empty results. The
  FastAPI lifespan lets that propagate (the app refuses to start against a dead
  database) and a global exception handler maps it to HTTP 503, so callers get a
  loud, clear failure instead of empty data. In the compose stack
  ``depends_on: service_healthy`` already prevents starting against an unready
  database.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

from market_data.config import get_settings

logger = logging.getLogger(__name__)

# Arbitrary but stable key for the schema-bootstrap advisory lock. Shared by every
# process that calls `bootstrap()` against the same database.
_BOOTSTRAP_LOCK_KEY = 0x5A1E_5DB0

# Seconds to wait for a pooled connection before declaring the DB unreachable.
CONNECT_TIMEOUT = 5.0


class DatabaseUnavailable(RuntimeError):
    """Raised when PostgreSQL cannot be reached or a pooled connection fails."""


# The agreed table shapes for this phase. All statements are idempotent; the
# whole script runs under one advisory-locked transaction (see `bootstrap`).
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS alerts (
    id text PRIMARY KEY,
    symbol text NOT NULL,
    condition text NOT NULL CHECK (condition IN ('above', 'below')),
    threshold double precision NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    triggered boolean NOT NULL DEFAULT false,
    created_at bigint NOT NULL,
    color text,
    seq bigserial NOT NULL
);
CREATE INDEX IF NOT EXISTS alerts_seq_desc_idx ON alerts (seq DESC);

CREATE TABLE IF NOT EXISTS chart_config (
    category text NOT NULL,
    symbol text NOT NULL,
    timeframe text NOT NULL,
    state jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (category, symbol, timeframe)
);

CREATE TABLE IF NOT EXISTS blockbeats_cache (
    cache_key text PRIMARY KEY,
    endpoint text NOT NULL,
    network text,
    type text,
    fetched_at timestamptz NOT NULL,
    data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    source text NOT NULL,
    seq bigserial NOT NULL,
    id text NOT NULL,
    ts bigint NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (source, seq)
);

-- OHLCV candles (Phase-2: the former Parquet day-file store). One row per bar;
-- `open_time` is epoch milliseconds kept as a bigint; the five price/volume
-- fields are double precision (never numeric) so no float drift is introduced.
-- A single table + a BRIN index on `open_time` (append-only, physically ordered
-- by the PK within a series) is deliberately chosen over declarative
-- partitioning: 78k rows today, designed to grow without over-engineering.
CREATE TABLE IF NOT EXISTS candles (
    category text NOT NULL,
    symbol text NOT NULL,
    timeframe text NOT NULL,
    open_time bigint NOT NULL,
    open double precision NOT NULL,
    high double precision NOT NULL,
    low double precision NOT NULL,
    close double precision NOT NULL,
    volume double precision NOT NULL,
    PRIMARY KEY (category, symbol, timeframe, open_time)
);
CREATE INDEX IF NOT EXISTS candles_open_time_brin ON candles USING brin (open_time);

-- Agent projections (Phase-3: the former JSONL files under data_dir/agent).
-- The worker is the sole writer and appends synchronously; the FastAPI reads.
-- `stream_events.id` is a GLOBAL bigserial cursor: the payload's `seq` is a
-- per-run counter that resets to 0 on every run, so it cannot order a stream.
-- `payload`/`record` keep the exact stored JSON so the on-the-wire shape is
-- unchanged. `proposals.id` / `runs.id` preserve the former append order for
-- the "newest first" lists (ORDER BY id DESC).
CREATE TABLE IF NOT EXISTS stream_events (
    id bigserial PRIMARY KEY,
    thread_id text NOT NULL,
    seq integer,
    type text NOT NULL,
    payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS stream_events_thread_id_id ON stream_events (thread_id, id);

CREATE TABLE IF NOT EXISTS proposals (
    proposal_id text PRIMARY KEY,
    produced_at timestamptz,
    kind text,
    record jsonb NOT NULL,
    id bigserial
);
CREATE INDEX IF NOT EXISTS proposals_id_desc_idx ON proposals (id DESC);

CREATE TABLE IF NOT EXISTS runs (
    run_id text PRIMARY KEY,
    thread_id text,
    kind text,
    status text,
    started_at timestamptz,
    finished_at timestamptz,
    record jsonb NOT NULL,
    id bigserial
);
CREATE INDEX IF NOT EXISTS runs_id_desc_idx ON runs (id DESC);
"""


def _redact(dsn: str) -> str:
    """Best-effort DSN redaction for log/error messages (never leak the password)."""
    try:
        from psycopg.conninfo import conninfo_to_dict, make_conninfo

        info = conninfo_to_dict(dsn)
        if info.get("password"):
            info["password"] = "***"
        return make_conninfo(**info)
    except Exception:  # noqa: BLE001 - redaction must never raise
        return "<dsn>"


class Database:
    """A lazily-opened, process-wide-safe pool bound to one DSN."""

    def __init__(
        self,
        dsn: str,
        *,
        min_size: int = 1,
        max_size: int = 10,
        bootstrap: bool = False,
    ) -> None:
        self.dsn = dsn
        self._pool = ConnectionPool(
            dsn,
            min_size=min_size,
            max_size=max_size,
            open=False,
            kwargs={
                "autocommit": True,
                "prepare_threshold": 0,
                "row_factory": dict_row,
            },
        )
        self._open_lock = threading.Lock()
        self._bootstrap_lock = threading.Lock()
        self._opened = False
        self._bootstrapped = False
        self._closed = False
        if bootstrap:
            self.bootstrap()

    # -- lifecycle ---------------------------------------------------------
    def _ensure_open(self) -> None:
        if self._opened:
            return
        with self._open_lock:
            if not self._opened:
                self._pool.open(wait=False)
                self._opened = True

    @contextmanager
    def connection(self) -> Iterator[psycopg.Connection]:
        """Acquire a pooled connection; translate failures to `DatabaseUnavailable`."""
        self._ensure_open()
        try:
            with self._pool.connection(timeout=CONNECT_TIMEOUT) as conn:
                yield conn
        except (psycopg.OperationalError, PoolTimeout) as exc:
            raise DatabaseUnavailable(
                f"PostgreSQL unavailable at {_redact(self.dsn)}: {exc}"
            ) from exc

    def bootstrap(self) -> None:
        """Create the schema once, safely under concurrent process startups."""
        if self._bootstrapped:
            return
        with self._bootstrap_lock:
            if self._bootstrapped:
                return
            try:
                with self.connection() as conn, conn.transaction():
                    conn.execute("SELECT pg_advisory_xact_lock(%s)", (_BOOTSTRAP_LOCK_KEY,))
                    conn.execute(SCHEMA_SQL, prepare=False)
            except DatabaseUnavailable:
                raise
            self._bootstrapped = True

    def close(self) -> None:
        with self._open_lock:
            if not self._closed:
                try:
                    self._pool.close()
                finally:
                    self._closed = True
                    self._opened = False


# -- process-wide registry -------------------------------------------------
_databases: dict[str, Database] = {}
_databases_lock = threading.Lock()


def get_database(dsn: str | None = None) -> Database:
    """Return the shared `Database` for `dsn` (or the configured one)."""
    resolved = (dsn or get_settings().postgres_dsn).strip()
    with _databases_lock:
        database = _databases.get(resolved)
        if database is None:
            database = Database(resolved)
            _databases[resolved] = database
        return database


def reset_databases() -> None:
    """Close and forget every cached `Database` (test isolation / shutdown)."""
    with _databases_lock:
        databases = list(_databases.values())
        _databases.clear()
    for database in databases:
        database.close()
