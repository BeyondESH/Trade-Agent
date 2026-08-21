"""Shared fixtures for the full-stack E2E test suite (L1/L2).

Provides:
  - tmp_settings: Settings bound to a temp data dir (MD_DATA_DIR isolation)
  - seed_store: deterministic parquet seed (complete + gapped segments)
  - live_server: a real uvicorn subprocess bound to the seeded store
  - network availability helpers for the --online subset
"""

from __future__ import annotations

import logging
import math
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterator

import httpx
import pandas as pd
import pytest

from market_data.config import Settings
from market_data.models import Series
from market_data.store import ParquetStore

logger = logging.getLogger(__name__)

SEED_BASE = 1_700_000_000_000  # 2023-11-14 22:13 UTC
LIVE_BACKEND_ENV = "MD_TEST_BACKEND"


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def tmp_settings(tmp_path: Path) -> Settings:
    """Settings pointing at a throwaway data dir (MD_DATA_DIR isolation)."""
    return Settings(data_dir=tmp_path)


@pytest.fixture
def seed_store(tmp_settings: Settings) -> ParquetStore:
    """Deterministic parquet seed: 3 symbols x 2 timeframes, with a gap in one.

    Layout:
      BTCUSDT 1m  (120 bars, gapless)
      BTCUSDT 1h  (72 bars with a 3-step gap in the middle)
      ETHUSDT  1h  (48 bars, gapless)
      SOLUSDT  1h  (48 bars, gapless)
    """
    store = ParquetStore(tmp_settings.parquet_dir)

    def _frame(symbol: str, timeframe: str, n: int, step_ms: int, gap: tuple[int, int] | None = None) -> pd.DataFrame:
        rows = []
        idx = 0
        base = SEED_BASE
        while len(rows) < n:
            if gap and idx == gap[0]:
                idx += gap[1] - gap[0]
                continue
            rows.append((base + idx * step_ms, 100.0, 105.0, 95.0, 101.0, 10.0))
            idx += 1
        return pd.DataFrame(rows, columns=["open_time", "open", "high", "low", "close", "volume"])

    store.save(Series("USDT-FUTURES", "BTCUSDT", "1m"), _frame("BTCUSDT", "1m", 120, 60_000))
    store.save(Series("USDT-FUTURES", "BTCUSDT", "1h"), _frame("BTCUSDT", "1h", 72, 3_600_000, gap=(30, 33)))
    store.save(Series("USDT-FUTURES", "ETHUSDT", "1h"), _frame("ETHUSDT", "1h", 48, 3_600_000))
    store.save(Series("USDT-FUTURES", "SOLUSDT", "1h"), _frame("SOLUSDT", "1h", 48, 3_600_000))
    return store


def _backend_reachable(base: str, timeout: float = 1.5) -> bool:
    try:
        r = httpx.get(f"{base}/health", timeout=timeout)
        return r.status_code == 200
    except Exception:  # noqa: BLE001
        return False


def _external_reachable(url: str, timeout: float = 3.0) -> bool:
    try:
        r = httpx.get(url, timeout=timeout)
        return r.status_code < 500
    except Exception:  # noqa: BLE001
        return False


@pytest.fixture(scope="session")
def bitget_reachable() -> bool:
    return _external_reachable("https://api.bitget.com/api/v2/public/time")


@pytest.fixture(scope="session")
def blockbeats_reachable() -> bool:
    return _external_reachable("https://api.blockbeats.info/newsflash/list")


def _spawn_live(env: dict[str, str], port: int) -> tuple[subprocess.Popen, Path]:
    root = Path(__file__).resolve().parents[1]
    log_path = Path(env["MD_DATA_DIR"]) / "uvicorn.log"
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "market_data.webapi:create_app", "--factory",
         "--host", "127.0.0.1", "--port", str(port)],
        cwd=str(root),
        env=env,
        stdout=log_path.open("w", encoding="utf-8", errors="replace"),
        stderr=subprocess.STDOUT,
    )
    return proc, log_path


@pytest.fixture(scope="session")
def live_server(tmp_path_factory) -> Iterator[str]:
    """A real uvicorn process serving a freshly seeded store.

    Spawns on an ephemeral port with MD_DATA_DIR pointing at a temp dir and
    the incremental-persistence scheduler disabled (schedule_interval=0) so
    tests are deterministic. Yields the base URL and terminates the process on
    teardown.
    """
    data_dir = tmp_path_factory.mktemp("live-server-data")
    store = ParquetStore(data_dir / "parquet")
    for key, step_ms, n, gap in (
        ("USDT-FUTURES/BTCUSDT/1m", 60_000, 120, None),
        ("USDT-FUTURES/BTCUSDT/1h", 3_600_000, 72, (30, 33)),
        ("USDT-FUTURES/ETHUSDT/1h", 3_600_000, 48, None),
        ("USDT-FUTURES/SOLUSDT/1h", 3_600_000, 48, None),
    ):
        cat, sym, tf = key.split("/")
        rows, idx = [], 0
        while len(rows) < n:
            if gap and idx == gap[0]:
                idx += gap[1] - gap[0]
                continue
            # close varies deterministically so the DL backtest pipeline has
            # non-constant features and produces a real result.
            close = 101.0 + 0.5 * math.sin(idx / 4.0)
            rows.append((SEED_BASE + idx * step_ms, 100.0, 105.0, 95.0, close, 10.0))
            idx += 1
        df = pd.DataFrame(rows, columns=["open_time", "open", "high", "low", "close", "volume"])
        store.save(Series(cat, sym, tf), df)

    port = _free_port()
    env = dict(os.environ)
    env["MD_DATA_DIR"] = str(data_dir)
    env["MD_SCHEDULE_INTERVAL_SECONDS"] = "0"
    env["MD_LOG_LEVEL"] = "WARNING"
    proc, log_path = _spawn_live(env, port)
    base = f"http://127.0.0.1:{port}"
    try:
        deadline = time.time() + 45
        ready = False
        while time.time() < deadline:
            if proc.poll() is not None:
                break
            if _backend_reachable(base, timeout=1.0):
                ready = True
                break
            time.sleep(0.25)
        if not ready:
            log_text = log_path.read_text(encoding="utf-8", errors="replace") if log_path.exists() else "(no log)"
            proc.kill()
            pytest.fail(f"live server failed to start on {base}:\n{log_text[-3000:]}")
        yield base
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


@pytest.fixture(scope="session")
def live_backend_or_skip(live_server: str) -> str:
    """Skip when the live server is unreachable (defensive; usually already up)."""
    if not _backend_reachable(live_server):
        pytest.skip("live backend unreachable")
    return live_server


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:  # noqa: ANN001
    """Auto-skip --online-marked tests when the live backend is not reachable."""
    if not config.getoption("--run-online", default=False):
        for item in items:
            if "online" in item.keywords:
                item.add_marker(
                    pytest.mark.skipif(True, reason="--run-online not passed; online subset disabled")
                )


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--run-online",
        action="store_true",
        default=False,
        help="run tests marked --online (require external network / live data)",
    )
