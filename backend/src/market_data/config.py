"""Configuration and logging setup (tasks 1.3, 1.4)."""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables / .env.

    All fields are optional with sensible defaults so public market data
    can be pulled without any credentials.
    """

    model_config = SettingsConfigDict(
        env_prefix="MD_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    # Default ingestion targets used by the scheduled job.
    category: str = "USDT-FUTURES"
    symbols: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    )
    timeframes: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["1m", "5m", "15m", "30m", "1h", "4h", "12h", "1d"]
    )
    # Market categories served by the exchange hub (Bitget product lines).
    categories: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["SPOT", "MARGIN", "USDT-FUTURES", "USDC-FUTURES", "COIN-FUTURES"]
    )

    # Storage / export root.
    data_dir: Path = Path("./data")

    # Scheduler.
    schedule_interval_seconds: int = 300

    # Bitget public WebSocket (real-time klines, no auth required).
    ws_public_url: str = "wss://ws.bitget.com/v2/ws/public"
    ws_heartbeat_seconds: int = 30
    ws_reconnect_seconds: float = 5.0

    # MCP server launch command.
    mcp_command: str = "npx"
    mcp_args: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["-y", "@bitget-ai/bitget-agent-mcp"]
    )

    # BlockBeats news/data API key. Read from `BB_API_KEY` (or `MD_BB_API_KEY`)
    # env var / backend/.env so a user can configure it in .env directly.
    bb_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("bb_api_key", "BB_API_KEY", "MD_BB_API_KEY"),
    )

    # Per-request candle page size. Bitget history-candles caps this at 100.
    candle_page_limit: int = 100

    log_level: str = "INFO"

    @field_validator("symbols", "timeframes", "mcp_args", "categories", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        """Allow comma-separated strings from env (e.g. MD_SYMBOLS=BTCUSDT,ETHUSDT)."""
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @property
    def parquet_dir(self) -> Path:
        return self.data_dir / "parquet"

    @property
    def excel_dir(self) -> Path:
        return self.data_dir / "excel"

    @property
    def chart_config_path(self) -> Path:
        return self.data_dir / "config" / "chart.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def setup_logging(level: str | None = None) -> None:
    """Initialise a single, consistent logging configuration."""
    resolved = level or get_settings().log_level
    logging.basicConfig(
        level=getattr(logging, resolved.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
