"""Tests for timeframe helpers (case-insensitive normalization)."""

from __future__ import annotations

import pytest

from market_data.models import timeframe_step_ms, timeframe_to_granularity


def test_timeframe_step_case_insensitive() -> None:
    assert timeframe_step_ms("1H") == timeframe_step_ms("1h") == 3_600_000
    assert timeframe_step_ms("4H") == timeframe_step_ms("4h") == 14_400_000
    assert timeframe_step_ms("12H") == timeframe_step_ms("12h") == 43_200_000
    assert timeframe_step_ms("1D") == timeframe_step_ms("1d") == 86_400_000
    assert timeframe_step_ms("5M") == timeframe_step_ms("5m") == 300_000


def test_timeframe_granularity_case_insensitive() -> None:
    assert timeframe_to_granularity("1H") == timeframe_to_granularity("1h") == "1H"
    assert timeframe_to_granularity("4H") == timeframe_to_granularity("4h") == "4H"
    assert timeframe_to_granularity("1D") == timeframe_to_granularity("1d") == "1D"


def test_timeframe_unsupported_raises() -> None:
    with pytest.raises(ValueError):
        timeframe_step_ms("99x")
    with pytest.raises(ValueError):
        timeframe_to_granularity("99x")
