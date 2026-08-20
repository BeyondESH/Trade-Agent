"""L1 data-integrity gate: full parquet data quality across every series.

Enumerates all series under the parquet store and asserts:
  - open_time strictly ascending, no duplicates
  - OHLC legal (high >= max(open, close), low <= min(open, close), volume >= 0)
  - adjacent bar spacing == timeframe step (head/tail truncation exempt)
  - gaps classified: type A (>= 5 steps, structurally exempt), type B (1-2
    steps, hard gate against KNOWN_GAPS whitelist), type C (staleness, online)
  - the whitelist entries themselves are exact: any unknown micro-gap fails

Run:
    pytest -m integrity        # from backend/
    pytest tests/test_data_integrity.py -v
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from market_data.config import Settings
from market_data.models import Series, timeframe_step_ms
from market_data.store import ParquetStore

from data_registry import KNOWN_GAPS, STRUCTURAL_EXEMPTIONS

TYPE_A_MIN_STEPS = 5

pytestmark = pytest.mark.integrity


def _backend_healthy() -> bool:
    """True when a market-data backend is reachable on the default port.

    Freshness (type C) only makes sense while the live backend is ingesting;
    with the backend stopped, a stale tail is an environment condition, not a
    data defect, so those cases are skipped rather than failed.
    """
    import os

    import httpx

    base = os.environ.get("MD_TEST_BACKEND", "http://127.0.0.1:8000")
    try:
        r = httpx.get(f"{base}/health", timeout=1.5)
        return r.status_code == 200
    except Exception:  # noqa: BLE001
        return False


needs_backend = pytest.mark.skipif(
    not _backend_healthy(),
    reason="backend not running; data freshness only verified against a live backend",
)


def _discover_series(parquet_dir: Path) -> list[Series]:
    """Enumerate all (category, symbol, timeframe) from the parquet layout."""
    series_list: list[Series] = []
    if not parquet_dir.exists():
        return series_list
    for cat_dir in sorted(parquet_dir.iterdir()):
        if not cat_dir.is_dir():
            continue
        for sym_dir in sorted(cat_dir.iterdir()):
            if not sym_dir.is_dir():
                continue
            for tf_dir in sorted(sym_dir.iterdir()):
                if not tf_dir.is_dir():
                    continue
                if list(tf_dir.glob("*.parquet")):
                    series_list.append(Series(cat_dir.name, sym_dir.name, tf_dir.name))
    return series_list


def _series_key(series: Series) -> str:
    return f"{series.category}/{series.symbol}/{series.timeframe}"


def pytest_generate_tests(metafunc: pytest.Metafunc) -> None:
    if "series_data" not in metafunc.fixturenames:
        return
    settings = Settings()
    found = _discover_series(settings.parquet_dir)
    if not found:
        metafunc.parametrize("series_data", [("EMPTY", None)], ids=["empty"])
        return
    store = ParquetStore(settings.parquet_dir)
    args: list[tuple[str, pd.DataFrame]] = []
    for s in found:
        df = store.read(s)
        if df is not None and len(df):
            args.append((_series_key(s), df))
    metafunc.parametrize("series_data", args, ids=[a[0] for a in args])


def _verify_ascending(t: np.ndarray) -> list[str]:
    problems: list[str] = []
    d = np.diff(t)
    dups = int((d == 0).sum())
    if dups:
        problems.append(f"duplicate open_time x{dups}")
    non_asc = int((d < 0).sum())
    if non_asc:
        problems.append(f"non-ascending open_time x{non_asc}")
    return problems


def _verify_ohlc(df: pd.DataFrame) -> list[str]:
    problems: list[str] = []
    cols = ("open", "high", "low", "close")
    try:
        o = df["open"].to_numpy(dtype="float64")
        h = df["high"].to_numpy(dtype="float64")
        l = df["low"].to_numpy(dtype="float64")
        c = df["close"].to_numpy(dtype="float64")
        v = df["volume"].to_numpy(dtype="float64")
    except KeyError:
        return [f"missing columns {cols}"]
    if not np.all(np.isfinite(o)) or not np.all(np.isfinite(h)) or not np.all(np.isfinite(l)) or not np.all(np.isfinite(c)):
        problems.append("non-finite OHLC values present")
    bad_high = int((h < np.maximum(o, c)).sum())
    if bad_high:
        problems.append(f"high < max(open,close) x{bad_high}")
    bad_low = int((l > np.minimum(o, c)).sum())
    if bad_low:
        problems.append(f"low > min(open,close) x{bad_low}")
    if int((v < 0).sum()):
        problems.append("negative volume present")
    return problems


def _classify_gaps(t: np.ndarray, step: int) -> tuple[list[tuple[int, int, int]], list[tuple[int, int, int]]]:
    """Return (type_a, type_b) gap lists; each item is (lo_ms, hi_ms, steps)."""
    d = np.diff(t)
    mult = np.rint(d / step).astype(int)
    type_a: list[tuple[int, int, int]] = []
    type_b: list[tuple[int, int, int]] = []
    for i, m in enumerate(mult):
        if m == 1:
            continue
        gap = (int(t[i]), int(t[i + 1]), int(m))
        if m >= TYPE_A_MIN_STEPS:
            type_a.append(gap)
        else:
            type_b.append(gap)
    return type_a, type_b


def test_series_discovered_have_data(series_data: tuple[str, pd.DataFrame]) -> None:
    key, df = series_data
    assert df is not None and len(df) > 0, f"series {key} has no data"


def test_open_time_strictly_ascending(series_data: tuple[str, pd.DataFrame]) -> None:
    key, df = series_data
    t = df["open_time"].to_numpy(dtype="int64")
    problems = _verify_ascending(t)
    assert not problems, f"{key}: {problems}"


def test_ohlc_legal(series_data: tuple[str, pd.DataFrame]) -> None:
    key, df = series_data
    problems = _verify_ohlc(df)
    assert not problems, f"{key}: {problems}"


def test_adjacent_spacing_equals_step(series_data: tuple[str, pd.DataFrame]) -> None:
    key, df = series_data
    series = Series(*key.split("/"))
    step = timeframe_step_ms(series.timeframe)
    t = df["open_time"].to_numpy(dtype="int64")
    type_a, type_b = _classify_gaps(t, step)
    unexpected_a = [g for g in type_a if g[:2] not in STRUCTURAL_EXEMPTIONS.get(key, [])]
    unexpected_b = [g for g in type_b if g[:2] not in KNOWN_GAPS.get(key, [])]
    problems = []
    if unexpected_a:
        problems.append(f"unexempted structural gaps: {unexpected_a}")
    if unexpected_b:
        problems.append(f"unknown micro-gaps: {unexpected_b}")
    assert not problems, f"{key}: {problems}"


def test_gap_classification_consistent(series_data: tuple[str, pd.DataFrame]) -> None:
    """Whitelist entries must match actual gaps: no stale whitelist rows."""
    key, df = series_data
    series = Series(*key.split("/"))
    step = timeframe_step_ms(series.timeframe)
    t = df["open_time"].to_numpy(dtype="int64")
    type_a, type_b = _classify_gaps(t, step)
    actual_a = {g[:2] for g in type_a}
    actual_b = {g[:2] for g in type_b}
    registered_b = set(KNOWN_GAPS.get(key, []))
    registered_a = set(STRUCTURAL_EXEMPTIONS.get(key, []))
    stale_b = registered_b - actual_b
    stale_a = registered_a - actual_a
    problems = []
    if stale_b:
        problems.append(f"stale KNOWN_GAPS entries (no longer present): {sorted(stale_b)}")
    if stale_a:
        problems.append(f"stale STRUCTURAL_EXEMPTIONS entries: {sorted(stale_a)}")
    assert not problems, f"{key}: {problems}"


@pytest.mark.online
@needs_backend
def test_data_freshness(series_data: tuple[str, pd.DataFrame]) -> None:
    """Type C: series must not be stale by more than 2 steps. Online only."""
    key, df = series_data
    series = Series(*key.split("/"))
    step = timeframe_step_ms(series.timeframe)
    t = df["open_time"].to_numpy(dtype="int64")
    latest = int(t[-1])
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    assert now - latest <= 2 * step, (
        f"{key}: stale, latest={datetime.fromtimestamp(latest / 1000, timezone.utc)} "
        f"now={datetime.fromtimestamp(now / 1000, timezone.utc)}"
    )
