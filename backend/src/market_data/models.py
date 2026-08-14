"""OHLCV data model and timeframe helpers.

Canonical OHLCV columns (UTC milliseconds for open_time):
    open_time, open, high, low, close, volume
"""

from __future__ import annotations

from dataclasses import dataclass

OHLCV_COLUMNS: list[str] = ["open_time", "open", "high", "low", "close", "volume"]

# Our internal timeframe -> step in milliseconds.
_TIMEFRAME_STEP_MS: dict[str, int] = {
    "1m": 60_000,
    "3m": 180_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "6h": 21_600_000,
    "12h": 43_200_000,
    "1d": 86_400_000,
    "1w": 604_800_000,
}

# Our internal timeframe -> Bitget MCP `market` tool `interval` token.
_TIMEFRAME_GRANULARITY: dict[str, str] = {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1H",
    "4h": "4H",
    "6h": "6H",
    "12h": "12H",
    "1d": "1D",
}


def timeframe_step_ms(timeframe: str) -> int:
    try:
        return _TIMEFRAME_STEP_MS[timeframe]
    except KeyError as exc:
        raise ValueError(f"Unsupported timeframe: {timeframe!r}") from exc


def timeframe_to_granularity(timeframe: str) -> str:
    try:
        return _TIMEFRAME_GRANULARITY[timeframe]
    except KeyError as exc:
        raise ValueError(f"Unsupported timeframe: {timeframe!r}") from exc


@dataclass(frozen=True)
class Series:
    """Identity of a stored/queried candle series."""

    category: str
    symbol: str
    timeframe: str

    def relative_path(self) -> str:
        return f"{self.category}/{self.symbol}/{self.timeframe}"
