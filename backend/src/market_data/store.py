"""OHLCV candle store backed by PostgreSQL (Phase 2 of the persistence migration).

The public API and the observable semantics of the former Parquet day-file
store are preserved exactly, so the 34 call sites need no change beyond
construction:

* ``save`` returns the number of **net-new distinct bars** (a re-save of the
  same frame returns 0; a re-save that only changes a price returns 0 new).
* ``read`` reproduces the former "newest-first, stop early at ``limit``, then
  ascending + ``tail(limit)``" window by querying
  ``ORDER BY open_time DESC LIMIT n`` and reversing - and the ``limit=None``
  case returns every row in range ascending. An empty result is still an empty
  DataFrame carrying the canonical columns.
* ``latest_open_time`` / ``earliest_open_time`` are ``MAX`` / ``MIN``.
* ``delete`` removes every row of one series.

Only the medium changed: bars live in the ``candles`` table (primary key
``(category, symbol, timeframe, open_time)``) instead of one Parquet file per
UTC day. The class name ``ParquetStore`` is retained on purpose: it is imported
and constructed at 34 sites and the migration brief requires their method calls
to stay untouched. The former per-day-file ``_file_cache`` is gone - PostgreSQL's
shared buffer pool plus the connection pool are the cache now, and an in-process
cache would need cross-process invalidation because the agent worker writes the
same table.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator, Sequence
from typing import Any

import pandas as pd

from market_data.db import Database, get_database
from market_data.models import OHLCV_COLUMNS, Series

logger = logging.getLogger(__name__)

_SELECT_COLUMNS = "open_time, open, high, low, close, volume"

# The upsert reports ``xmax = 0`` for a genuinely INSERTed row (its new tuple
# has no previous transaction) and ``False`` for a conflict that took the UPDATE
# branch - exactly the net-new bar count the old day-file merge produced. Each
# row binds 9 parameters; chunking keeps a statement well under PostgreSQL's
# 65535 bind-parameter ceiling.
_UPSERT_TEMPLATE = (
    "INSERT INTO candles "
    "(category, symbol, timeframe, open_time, open, high, low, close, volume) "
    "VALUES {placeholders} "
    "ON CONFLICT (category, symbol, timeframe, open_time) DO UPDATE SET "
    "open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, "
    "close = EXCLUDED.close, volume = EXCLUDED.volume "
    "RETURNING (xmax = 0) AS inserted"
)
_ROW_PLACEHOLDER = "(%s, %s, %s, %s, %s, %s, %s, %s, %s)"
_MAX_ROWS_PER_INSERT = 5000


def _chunk(rows: Sequence[tuple], size: int) -> Iterator[Sequence[tuple]]:
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


class ParquetStore:
    def __init__(self, database: Database | None = None, *, dsn: str | None = None) -> None:
        self._db = database or get_database(dsn)

    # -- write -------------------------------------------------------------
    def save(self, series: Series, frame: pd.DataFrame) -> int:
        """Upsert ``frame`` into ``candles`` in one transaction.

        Returns the number of newly added distinct ``open_time`` bars.
        """
        if frame.empty:
            return 0
        incoming = self._normalize(frame)
        # The old day-file merge deduplicated on `open_time` (keep last) before
        # writing; a single multi-row upsert must do the same or PostgreSQL
        # raises "ON CONFLICT DO UPDATE command cannot affect row a second time".
        incoming = incoming.drop_duplicates(subset="open_time", keep="last")
        rows = [
            (
                series.category,
                series.symbol,
                series.timeframe,
                int(open_time),
                float(open_),
                float(high),
                float(low),
                float(close),
                float(volume),
            )
            for open_time, open_, high, low, close, volume in incoming[OHLCV_COLUMNS].itertuples(
                index=False
            )
        ]
        added = 0
        with self._db.connection() as conn, conn.transaction():
            for chunk in _chunk(rows, _MAX_ROWS_PER_INSERT):
                placeholders = ", ".join([_ROW_PLACEHOLDER] * len(chunk))
                params = tuple(value for row in chunk for value in row)
                result = conn.execute(_UPSERT_TEMPLATE.format(placeholders=placeholders), params)
                added += sum(1 for row in result.fetchall() if row["inserted"])
        logger.info("Saved %s: +%d rows.", series.relative_path(), added)
        return added

    # -- read --------------------------------------------------------------
    def read(
        self,
        series: Series,
        start_ms: int | None = None,
        end_ms: int | None = None,
        limit: int | None = None,
    ) -> pd.DataFrame:
        clauses = ["category = %s", "symbol = %s", "timeframe = %s"]
        params: list[Any] = [series.category, series.symbol, series.timeframe]
        if start_ms is not None:
            clauses.append("open_time >= %s")
            params.append(int(start_ms))
        if end_ms is not None:
            clauses.append("open_time <= %s")
            params.append(int(end_ms))
        where = " AND ".join(clauses)

        with self._db.connection() as conn:
            if limit is not None:
                # Newest-first bounded scan, then reverse to ascending: the exact
                # result of the former "read newest day files, stop at limit,
                # sort asc, tail(limit)".
                rows = conn.execute(
                    f"SELECT {_SELECT_COLUMNS} FROM candles WHERE {where} "
                    "ORDER BY open_time DESC LIMIT %s",
                    [*params, int(limit)],
                ).fetchall()
                rows = list(reversed(rows))
            else:
                rows = conn.execute(
                    f"SELECT {_SELECT_COLUMNS} FROM candles WHERE {where} ORDER BY open_time ASC",
                    params,
                ).fetchall()

        if not rows:
            return pd.DataFrame(columns=OHLCV_COLUMNS)
        frame = pd.DataFrame(rows, columns=OHLCV_COLUMNS)
        return self._normalize(frame)

    def latest_open_time(self, series: Series) -> int | None:
        return self._extreme_open_time(series, "MAX")

    def earliest_open_time(self, series: Series) -> int | None:
        return self._extreme_open_time(series, "MIN")

    def _extreme_open_time(self, series: Series, func: str) -> int | None:
        with self._db.connection() as conn:
            row = conn.execute(
                f"SELECT {func}(open_time) AS open_time FROM candles "
                "WHERE category = %s AND symbol = %s AND timeframe = %s",
                (series.category, series.symbol, series.timeframe),
            ).fetchone()
        if row is None or row["open_time"] is None:
            return None
        return int(row["open_time"])

    def delete(self, series: Series) -> None:
        with self._db.connection() as conn:
            conn.execute(
                "DELETE FROM candles WHERE category = %s AND symbol = %s AND timeframe = %s",
                (series.category, series.symbol, series.timeframe),
            )

    # -- helpers -----------------------------------------------------------
    @staticmethod
    def _normalize(frame: pd.DataFrame) -> pd.DataFrame:
        missing = [c for c in OHLCV_COLUMNS if c not in frame.columns]
        if missing:
            raise ValueError(f"Frame missing OHLCV columns: {missing}")
        out = frame[OHLCV_COLUMNS].copy()
        out["open_time"] = out["open_time"].astype("int64")
        for col in ("open", "high", "low", "close", "volume"):
            out[col] = out[col].astype("float64")
        return out
