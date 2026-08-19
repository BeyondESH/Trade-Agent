"""Tests for timeframe helpers (case-insensitive normalization)."""

from __future__ import annotations

import pytest

from market_data.models import (
    granularity_to_timeframe,
    timeframe_step_ms,
    timeframe_to_granularity,
    timeframe_to_spot_granularity,
)


def test_timeframe_step_case_insensitive() -> None:
    assert timeframe_step_ms("1H") == timeframe_step_ms("1h") == 3_600_000
    assert timeframe_step_ms("2H") == timeframe_step_ms("2h") == 7_200_000
    assert timeframe_step_ms("4H") == timeframe_step_ms("4h") == 14_400_000
    assert timeframe_step_ms("6H") == timeframe_step_ms("6h") == 21_600_000
    assert timeframe_step_ms("12H") == timeframe_step_ms("12h") == 43_200_000
    assert timeframe_step_ms("1D") == timeframe_step_ms("1d") == 86_400_000
    assert timeframe_step_ms("3D") == timeframe_step_ms("3d") == 259_200_000
    assert timeframe_step_ms("5M") == timeframe_step_ms("5m") == 300_000


def test_timeframe_granularity_case_insensitive() -> None:
    assert timeframe_to_granularity("1H") == timeframe_to_granularity("1h") == "1H"
    assert timeframe_to_granularity("4H") == timeframe_to_granularity("4h") == "4H"
    assert timeframe_to_granularity("1D") == timeframe_to_granularity("1d") == "1D"


def test_full_native_set_step_resolvable() -> None:
    """Every historical Bitget-native level resolves a step."""
    expectations = {
        "1m": 60_000,
        "3m": 180_000,
        "5m": 300_000,
        "15m": 900_000,
        "30m": 1_800_000,
        "1h": 3_600_000,
        "2h": 7_200_000,
        "4h": 14_400_000,
        "6h": 21_600_000,
        "12h": 43_200_000,
        "1d": 86_400_000,
        "3d": 259_200_000,
        "1w": 604_800_000,
        "1mo": 2_592_000_000,
    }
    for tf, step in expectations.items():
        assert timeframe_step_ms(tf) == step, tf


def test_full_native_set_granularity_resolvable() -> None:
    """Every Bitget-native level (incl. realtime `1s`) resolves a token."""
    expectations = {
        "1s": "1s",
        "1m": "1m",
        "3m": "3m",
        "5m": "5m",
        "15m": "15m",
        "30m": "30m",
        "1h": "1H",
        "2h": "2H",
        "4h": "4H",
        "6h": "6H",
        "12h": "12H",
        "1d": "1D",
        "3d": "3D",
        "1w": "1W",
        "1mo": "1M",
    }
    for tf, token in expectations.items():
        assert timeframe_to_granularity(tf) == token, tf


def test_month_alias_folds_to_mo_not_minute() -> None:
    """The month token `1M` must resolve to `1mo`, never the minute key."""
    assert timeframe_step_ms("1M") == timeframe_step_ms("1mo")
    assert timeframe_to_granularity("1M") == "1M"
    assert timeframe_step_ms("1MO") == timeframe_step_ms("1mo")
    # Minute in any case stays minute.
    assert timeframe_to_granularity("1m") == "1m"


def test_month_and_minute_do_not_collide() -> None:
    assert timeframe_to_granularity("1mo") == "1M" != timeframe_to_granularity("1m")
    assert timeframe_to_granularity("1M") == "1M"
    assert timeframe_to_granularity("1m") == "1m"
    assert timeframe_to_granularity("1mo") != timeframe_to_granularity("1m")


def test_realtime_second_has_granularity_but_no_step() -> None:
    assert timeframe_to_granularity("1s") == "1s"
    with pytest.raises(ValueError):
        timeframe_step_ms("1s")


def test_reverse_granularity_map_roundtrips() -> None:
    for tf in ("1s", "1m", "5m", "1h", "2h", "1d", "3d", "1w", "1mo"):
        token = timeframe_to_granularity(tf)
        assert granularity_to_timeframe(token) == tf


def test_reverse_month_token_resolves_to_mo() -> None:
    """The month channel token `1M` must round-trip to `1mo`, not `1m`."""
    assert granularity_to_timeframe("1M") == "1mo"
    assert granularity_to_timeframe("1M") != "1m"


def test_reverse_unknown_token_raises() -> None:
    with pytest.raises(ValueError):
        granularity_to_timeframe("99x")
    with pytest.raises(ValueError):
        granularity_to_timeframe("15s")


def test_timeframe_unsupported_raises() -> None:
    with pytest.raises(ValueError):
        timeframe_step_ms("99x")
    with pytest.raises(ValueError):
        timeframe_to_granularity("99x")
    # Non-native levels must be rejected, never silently downgraded.
    with pytest.raises(ValueError):
        timeframe_to_granularity("15s")
    with pytest.raises(ValueError):
        timeframe_to_granularity("1y")


def test_spot_granularity_uses_long_form() -> None:
    """The spot REST endpoint needs long-form tokens distinct from futures."""
    assert timeframe_to_spot_granularity("1m") == "1min"
    assert timeframe_to_spot_granularity("1d") == "1day"
    assert timeframe_to_spot_granularity("3d") == "3day"
    assert timeframe_to_spot_granularity("1w") == "1week"
    assert timeframe_to_spot_granularity("1h") == "1H"
    assert timeframe_to_spot_granularity("1mo") == "1M"
    # Month and minute stay distinct in the spot map too.
    assert timeframe_to_spot_granularity("1mo") != timeframe_to_spot_granularity("1m")


def test_spot_granularity_rejects_realtime_only() -> None:
    with pytest.raises(ValueError):
        timeframe_to_spot_granularity("1s")
