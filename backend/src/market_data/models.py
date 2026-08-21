"""OHLCV data model and timeframe helpers.

Canonical OHLCV columns (UTC milliseconds for open_time):
    open_time, open, high, low, close, volume
"""

from __future__ import annotations

from dataclasses import dataclass

OHLCV_COLUMNS: list[str] = ["open_time", "open", "high", "low", "close", "volume"]

# Bitget market categories (product lines) supported by the hub.
MARKET_CATEGORIES: list[str] = [
    "SPOT",
    "USDT-FUTURES",
]

# Bitget instrument symbol types.
SYMBOL_TYPES: list[str] = ["crypto", "metal", "stock", "commodity"]

# Category -> Bitget v2 ticker endpoint base (v3 instruments covers all).
_CATEGORY_TICKER_API: dict[str, str] = {
    "SPOT": "https://api.bitget.com/api/v2/spot/market/tickers",
    "USDT-FUTURES": "https://api.bitget.com/api/v2/mix/market/tickers",
}


def category_ticker_api(category: str) -> str:
    try:
        return _CATEGORY_TICKER_API[category]
    except KeyError as exc:
        raise ValueError(f"Unsupported category: {category!r}") from exc

# Our internal timeframe -> step in milliseconds.
# Covers every Bitget-native level that provides history. `1s` is realtime-only
# and therefore intentionally excluded: it never paginates, persists or
# backfills, so it has no step. Month is keyed `1mo` to stay distinct from
# minute `1m` under case-insensitive comparison.
_TIMEFRAME_STEP_MS: dict[str, int] = {
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

# Our internal timeframe -> Bitget MCP `market` tool `interval` token.
# Includes `1s` (real-time WS `candle1s`) alongside the historical levels.
_TIMEFRAME_GRANULARITY: dict[str, str] = {
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

# Spot REST seeding granularity. The spot v2 candles endpoint uses long form
# tokens (`1min/1day/1week/1M`) that differ from the futures/mix short names
# (`1m/1D/1W/1M`). Only tokens that the spot endpoint accepts are listed; the
# realtime WS channel for spot still uses the shared short names above.
_TIMEFRAME_GRANULARITY_SPOT: dict[str, str] = {
    "1m": "1min",
    "3m": "3min",
    "5m": "5min",
    "15m": "15min",
    "30m": "30min",
    "1h": "1H",
    "2h": "2H",
    "4h": "4H",
    "6h": "6H",
    "12h": "12H",
    "1d": "1day",
    "3d": "3day",
    "1w": "1week",
    "1mo": "1M",
}

# Case-sensitive aliases that fold to a canonical key. The only collision to
# break is month `1M` (Bitget month token) vs minute `1m`: without this exact
# check, a lowercased `1M` would land on the minute series.
_TIMEFRAME_ALIASES: dict[str, str] = {
    "1M": "1mo",
    "1mo": "1mo",
    "1MO": "1mo",
}


def _normalize_timeframe(timeframe: str) -> str:
    """Normalize case so `1H/4H/12H/1D` and `1h/4h/12h/1d` both resolve.

    Month resolves to the `1mo` key, which can never collide with minute `1m`
    under case-insensitive comparison. The exact, case-sensitive alias lookup
    runs first so the Bitget month token `1M` is never folded onto `1m`.
    """
    if timeframe in _TIMEFRAME_ALIASES:
        return _TIMEFRAME_ALIASES[timeframe]
    return timeframe.lower()


# Timeframes served only by the real-time WS channel, with no REST history.
# Such levels must be excluded from persistence, backfill and seeding.
_REALTIME_ONLY_TIMEFRAMES: frozenset[str] = frozenset({"1s"})


def is_realtime_only_timeframe(timeframe: str) -> bool:
    """True when the level has no REST history (real-time push only)."""
    return _normalize_timeframe(timeframe) in _REALTIME_ONLY_TIMEFRAMES


# All valid persistence-level timeframes, newest first (realtime-only excluded).
VALID_TIMEFRAMES: list[str] = [
    tf for tf, _ in sorted(
        _TIMEFRAME_STEP_MS.items(), key=lambda kv: kv[1], reverse=True
    )
    if tf not in _REALTIME_ONLY_TIMEFRAMES
]


def validate_timeframe(timeframe: str) -> None:
    """Raise ValueError for timeframes outside the valid historical set."""
    norm = _normalize_timeframe(timeframe)
    if norm not in _TIMEFRAME_STEP_MS or norm in _REALTIME_ONLY_TIMEFRAMES:
        raise ValueError(f"Unsupported timeframe: {timeframe!r}")


def timeframe_step_ms(timeframe: str) -> int:
    try:
        return _TIMEFRAME_STEP_MS[_normalize_timeframe(timeframe)]
    except KeyError as exc:
        raise ValueError(f"Unsupported timeframe: {timeframe!r}") from exc


def timeframe_to_granularity(timeframe: str) -> str:
    try:
        return _TIMEFRAME_GRANULARITY[_normalize_timeframe(timeframe)]
    except KeyError as exc:
        raise ValueError(f"Unsupported timeframe: {timeframe!r}") from exc


def timeframe_to_spot_granularity(timeframe: str) -> str:
    """Bitget granularity token for the spot REST candles endpoint.

    Spot REST uses long-form tokens (`1week`, `1day`, `1min`); the futures/mix
    endpoint and both WS channels use short names. Raises for levels the spot
    endpoint does not serve (e.g. realtime-only `1s`).
    """
    key = _normalize_timeframe(timeframe)
    try:
        return _TIMEFRAME_GRANULARITY_SPOT[key]
    except KeyError as exc:
        raise ValueError(f"Unsupported spot granularity: {timeframe!r}") from exc


# Reverse lookup: Bitget granularity token -> canonical internal timeframe.
# Built lazily so the maps above can stay the single source of truth.
_granularity_reverse: dict[str, str] | None = None


def granularity_to_timeframe(granularity: str) -> str:
    """Map a Bitget granularity token back to the canonical internal timeframe.

    The reverse of `timeframe_to_granularity`. Used to parse an incoming
    realtime channel (e.g. `candle1M`) into a stable internal key. Because the
    resolution is token-driven rather than a blind lowercasing, the month token
    `1M` resolves to the `1mo` key instead of collapsing onto the minute `1m`.
    Returns None (via KeyError -> ValueError) for an unknown token.
    """
    global _granularity_reverse
    if _granularity_reverse is None:
        _granularity_reverse = {
            token: key for key, token in _TIMEFRAME_GRANULARITY.items()
        }
        if len(_granularity_reverse) != len(_TIMEFRAME_GRANULARITY):
            raise RuntimeError("Duplicate granularity token in map")
    try:
        return _granularity_reverse[granularity]
    except KeyError as exc:
        raise ValueError(f"Unsupported granularity token: {granularity!r}") from exc


@dataclass(frozen=True)
class Series:
    """Identity of a stored/queried candle series."""

    category: str
    symbol: str
    timeframe: str

    def relative_path(self) -> str:
        return f"{self.category}/{self.symbol}/{self.timeframe}"
