"""Parquet store for OHLCV candles (tasks 4.1-4.3).

Layout: <parquet_dir>/<category>/<symbol>/<timeframe>/<YYYY-MM-DD>.parquet
One file per UTC calendar day. Deduplicated and merged on `open_time`.
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from market_data.models import OHLCV_COLUMNS, Series

logger = logging.getLogger(__name__)


def _day_key(open_time_ms: "pd.Series") -> "pd.Series":
    return pd.to_datetime(open_time_ms, unit="ms", utc=True).dt.strftime("%Y-%m-%d")


class ParquetStore:
    def __init__(self, root: Path) -> None:
        self._root = Path(root)
        # Per-day-file cache (key = absolute parquet path). Reads hit the cache
        # instead of re-reading the same files during wide-range queries; save()
        # and delete() invalidate the affected entries.
        self._file_cache: dict[str, pd.DataFrame] = {}

    def _dir(self, series: Series) -> Path:
        return self._root / series.relative_path()

    def _day_path(self, series: Series, day: str) -> Path:
        return self._dir(series) / f"{day}.parquet"

    def _day_files(self, series: Series) -> list[Path]:
        directory = self._dir(series)
        if not directory.exists():
            return []
        return sorted(directory.glob("*.parquet"))

    # -- write (4.1, 4.2) --------------------------------------------------
    def save(self, series: Series, frame: pd.DataFrame) -> int:
        """Merge `frame` into per-day partitions, dedup on open_time.

        Returns the number of newly added rows across all days.
        """
        if frame.empty:
            return 0
        incoming = self._normalize(frame)
        incoming = incoming.assign(_day=_day_key(incoming["open_time"]))
        added = 0
        for day, group in incoming.groupby("_day"):
            path = self._day_path(series, str(day))
            path.parent.mkdir(parents=True, exist_ok=True)
            existing = self._read_file(path)
            before = len(existing)
            combined = (
                pd.concat([existing, group[OHLCV_COLUMNS]], ignore_index=True)
                .drop_duplicates(subset="open_time", keep="last")
                .sort_values("open_time")
                .reset_index(drop=True)
            )
            combined.to_parquet(path, index=False)
            added += len(combined) - before
            self._file_cache.pop(str(path), None)
        logger.info("Saved %s: +%d rows.", series.relative_path(), added)
        return added

    # -- read (4.3) --------------------------------------------------------
    def read(
        self,
        series: Series,
        start_ms: int | None = None,
        end_ms: int | None = None,
        limit: int | None = None,
    ) -> pd.DataFrame:
        files = self._day_files(series)
        if not files:
            return pd.DataFrame(columns=OHLCV_COLUMNS)
        # Narrow the candidate day files to the requested window before reading
        # anything, so wide-range reads do not scale with total history depth.
        start_day = _day_key(pd.Series([start_ms]))[0] if start_ms is not None else None
        end_day = _day_key(pd.Series([end_ms]))[0] if end_ms is not None else None
        candidates = files
        if start_day:
            candidates = [f for f in candidates if f.stem >= start_day]
        if end_day:
            candidates = [f for f in candidates if f.stem <= end_day]
        if not candidates:
            return pd.DataFrame(columns=OHLCV_COLUMNS)

        # With a limit, read newest day files first and stop once enough rows
        # have been collected (the caller only needs the tail of the range).
        frames: list[pd.DataFrame] = []
        total = 0
        for path in reversed(candidates):
            frame = self._read_cached(path)
            if frame.empty:
                continue
            frames.append(frame)
            total += len(frame)
            if limit is not None and total >= limit:
                break

        if not frames:
            return pd.DataFrame(columns=OHLCV_COLUMNS)
        frame = pd.concat(frames, ignore_index=True)
        if start_ms is not None:
            frame = frame[frame["open_time"] >= start_ms]
        if end_ms is not None:
            frame = frame[frame["open_time"] <= end_ms]
        frame = frame.sort_values("open_time").reset_index(drop=True)
        if limit is not None and len(frame) > limit:
            frame = frame.tail(limit).reset_index(drop=True)
        return frame

    def _read_cached(self, path: Path) -> pd.DataFrame:
        key = str(path)
        cached = self._file_cache.get(key)
        if cached is None:
            cached = self._read_file(path)
            self._file_cache[key] = cached
        return cached

    def latest_open_time(self, series: Series) -> int | None:
        files = self._day_files(series)
        if not files:
            return None
        # Day files are named YYYY-MM-DD, so the last one holds the latest bars.
        frame = self._read_file(files[-1])
        if frame.empty:
            return None
        return int(frame["open_time"].max())

    def earliest_open_time(self, series: Series) -> int | None:
        files = self._day_files(series)
        if not files:
            return None
        # Day files are named YYYY-MM-DD, so the first one holds the oldest bars.
        frame = self._read_file(files[0])
        if frame.empty:
            return None
        return int(frame["open_time"].min())

    def delete(self, series: Series) -> None:
        root = str(self._dir(series))
        for key in list(self._file_cache):
            if key.startswith(root):
                del self._file_cache[key]
        for path in self._day_files(series):
            path.unlink()

    @staticmethod
    def _read_file(path: Path) -> pd.DataFrame:
        if not path.exists():
            return pd.DataFrame(columns=OHLCV_COLUMNS)
        return pd.read_parquet(path)

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
