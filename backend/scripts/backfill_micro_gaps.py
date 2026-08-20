"""One-shot backfill of type-B micro-gaps (KNOWN_GAPS) via the public Bitget
v3 history-candles endpoint.

Reads the registries from tests/data_registry.py, fetches each gap window and
merges into the parquet store (dedup by open_time). Prints the before/after
gap status per series. Run from backend/:

    .venv/Scripts/python.exe scripts/backfill_micro_gaps.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))

from market_data.ingestion import KlineIngestor  # noqa: E402
from market_data.models import Series, timeframe_step_ms, timeframe_to_granularity  # noqa: E402
from market_data.store import ParquetStore  # noqa: E402

from data_registry import KNOWN_GAPS  # noqa: E402

STORE = ParquetStore(Path("data/parquet"))
TYPE_A_MIN_STEPS = 5


def ms_dt(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M")


def classify_gaps(series: Series) -> list[tuple[int, int, int]]:
    df = STORE.read(series)
    if df is None or not len(df):
        return []
    t = df["open_time"].to_numpy(dtype="int64")
    step = timeframe_step_ms(series.timeframe)
    d = pd.Series(t).diff().dropna().to_numpy(dtype="float64")
    mult = (d / step).round().astype(int)
    gaps = []
    for i, m in enumerate(mult):
        if m != 1:
            gaps.append((int(t[i]), int(t[i + 1]), int(m)))
    return gaps


def remaining_b_gaps(series: Series) -> list[tuple[int, int, int]]:
    return [g for g in classify_gaps(series) if g[2] < TYPE_A_MIN_STEPS]


def main() -> None:
    total_filled = 0
    for key, gaps in KNOWN_GAPS.items():
        cat, sym, tf = key.split("/")
        series = Series(cat, sym, tf)
        step = timeframe_step_ms(tf)
        granularity = timeframe_to_granularity(tf)

        before = remaining_b_gaps(series)
        print(f"[{key}] before: {len(before)} micro-gaps")

        for lo_ms, hi_ms in gaps:
            # Fetch a window ending at the gap's upper bound; one v3 page
            # (100 rows) easily covers the 1-2 missing bars.
            end_ms = hi_ms + step
            try:
                rows = KlineIngestor._fetch_v3_history_page(cat, sym, granularity, end_ms, 100)
                frame = KlineIngestor._normalize_payload(rows)
                if frame.empty:
                    print(f"    gap {ms_dt(lo_ms)} -> {ms_dt(hi_ms)}: EMPTY fetch")
                    continue
                # Keep only rows inside the gap window (plus a small margin).
                margin = 3 * step
                frame = frame[
                    (frame["open_time"] >= lo_ms - margin) & (frame["open_time"] <= hi_ms + margin)
                ]
                added = STORE.save(series, frame)
                if added:
                    total_filled += added
                    print(f"    gap {ms_dt(lo_ms)} -> {ms_dt(hi_ms)}: +{added} rows")
                else:
                    print(f"    gap {ms_dt(lo_ms)} -> {ms_dt(hi_ms)}: no new rows (gap still open)")
            except Exception as exc:  # noqa: BLE001
                print(f"    gap {ms_dt(lo_ms)} -> {ms_dt(hi_ms)}: ERROR {type(exc).__name__}: {exc}")

        after = remaining_b_gaps(series)
        print(f"[{key}] after: {len(after)} micro-gaps")
        for g in after:
            print(f"    remaining {ms_dt(g[0])} -> {ms_dt(g[1])} ({g[2]} steps)")

    print(f"TOTAL added rows: {total_filled}")


if __name__ == "__main__":
    main()
