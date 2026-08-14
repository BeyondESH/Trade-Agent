"""Offline tests for the FastAPI web API (TestClient, seeded data).

Run:
    python tests/test_webapi.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from market_data.config import Settings
from market_data.models import Series
from market_data.store import ParquetStore
from market_data.webapi import create_app

BASE = 1_700_000_000_000
STEP = 300_000


def _seed(tmp) -> Settings:  # noqa: ANN001
    settings = Settings(data_dir=Path(tmp))
    closes = np.array([100 + 5 * np.sin(i / 4) for i in range(150)], dtype="float64")
    closes[-1] = float(closes.min()) + 0.01  # park price near support
    df = pd.DataFrame({
        "open_time": [BASE + i * STEP for i in range(len(closes))],
        "open": closes, "high": closes + 0.5, "low": closes - 0.5,
        "close": closes, "volume": [1.0] * len(closes),
    })
    ParquetStore(settings.parquet_dir).save(Series("USDT-FUTURES", "BTCUSDT", "5m"), df)
    return settings


def _client(tmp) -> TestClient:  # noqa: ANN001
    return TestClient(create_app(_seed(tmp)))


def _tmp():
    return tempfile.TemporaryDirectory()


class _FakeStream:
    """Minimal stream stand-in: `latest`/`recent` return canned data."""

    def __init__(self, bar=None, bars=None) -> None:  # noqa: ANN001
        self.bar = bar
        self.bars = bars or ([bar] if bar else [])

    def latest(self, category: str, symbol: str, timeframe: str) -> dict | None:  # noqa: ARG001
        return self.bar

    def recent(self, category: str, symbol: str, timeframe: str, limit: int | None = None) -> list:  # noqa: ARG001
        return self.bars[-limit:] if limit is not None else list(self.bars)

    def start(self) -> None:
        return

    async def stop(self) -> None:
        return


# -- 8.1 core --------------------------------------------------------------
def test_health() -> None:
    with _tmp() as tmp:
        r = _client(tmp).get("/health")
        assert r.status_code == 200 and r.json()["status"] == "ok"


def test_analyze_insufficient_is_structured_error() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        r = c.get("/analyze", params={"symbol": "ETHUSDT", "timeframe": "5m"})  # no data
        assert r.status_code == 422 and "detail" in r.json()


# -- 8.2 market ------------------------------------------------------------
def test_candles_and_analyze_and_structure() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        p = {"symbol": "BTCUSDT", "timeframe": "5m"}
        assert c.get("/candles", params=p).json()["count"] > 0
        a = c.get("/analyze", params=p).json()
        assert "price" in a and isinstance(a["levels"], list)
        s = c.get("/structure", params=p).json()
        assert "swings" in s and "box" in s


# -- 8.3 config ------------------------------------------------------------
def test_config_roundtrip_and_reject() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        cfg = c.get("/config").json()
        cfg["risk"]["margin_pct"] = 0.03
        cfg["system_prompt"] = "custom prompt"
        cfg["manual_rules"] = ["never fomo"]
        assert c.put("/config", json=cfg).status_code == 200
        back = c.get("/config").json()
        assert back["risk"]["margin_pct"] == 0.03 and back["manual_rules"] == ["never fomo"]
        # invalid
        bad = c.get("/config").json()
        bad["risk"]["margin_pct"] = 2.0
        assert c.put("/config", json=bad).status_code == 400


# -- 8.3b chart config -----------------------------------------------------
def test_chart_config_roundtrip_and_reject() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        p = {"symbol": "BTCUSDT", "timeframe": "5m"}
        # missing -> empty template
        empty = c.get("/chart-config", params=p).json()
        assert empty["indicators"] == [] and empty["layers"]["sr"] is True
        # put -> get roundtrip
        state = {
            "indicators": [{"name": "MACD", "pane": "sub"}],
            "drawings": [{"name": "segment", "points": [{"timestamp": 1, "value": 100}]}],
            "layers": {"sr": True, "structure": False, "smc": True},
        }
        body = {"category": "USDT-FUTURES", "symbol": "BTCUSDT", "timeframe": "5m", "state": state}
        assert c.put("/chart-config", json=body).status_code == 200
        back = c.get("/chart-config", params=p).json()
        assert back["indicators"][0]["name"] == "MACD"
        assert back["layers"] == {"sr": True, "structure": False, "smc": True}
        # per-series isolation
        other = c.get("/chart-config", params={"symbol": "ETHUSDT", "timeframe": "5m"}).json()
        assert other["drawings"] == []
        # oversize -> 400 (ValueError handler)
        bad = dict(body)
        bad["state"] = {"indicators": [], "drawings": [{"name": "x"} for _ in range(101)], "layers": {}}
        assert c.put("/chart-config", json=bad).status_code == 400



# -- 8.4 agent -------------------------------------------------------------
def test_agent_decide_and_cycle() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        body = {"category": "USDT-FUTURES", "symbol": "BTCUSDT", "timeframe": "5m"}
        d = c.post("/agent/decide", json=body).json()
        assert d["action"] in ("open", "close", "hold")
        r = c.post("/agent/cycle", json=body).json()
        assert "status" in r
        assert c.get("/portfolio").status_code == 200


# -- 8.5 control + confirm-token flow -------------------------------------
def test_order_confirm_token_flow() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        order = {"symbol": "BTCUSDT", "side": "long", "leverage": 100.0, "price": 100.0}
        # submit -> token, no fill yet
        res = c.post("/order", json=order).json()
        assert "token" in res
        assert c.get("/portfolio").json()["positions"] == {}
        # confirm -> paper fill
        conf = c.post("/order/confirm", json={"token": res["token"]}).json()
        assert conf["filled"] and conf["live"] is False
        # token cannot be reused
        assert c.post("/order/confirm", json={"token": res["token"]}).status_code == 400


def test_kill_switch_blocks_order() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        c.put("/control", json={"kill_switch": True})
        r = c.post("/order", json={"symbol": "BTCUSDT", "side": "long", "leverage": 100.0, "price": 100.0})
        assert r.status_code == 403


def test_order_risk_rejection_no_token() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        # fill the whole margin cap first
        t = c.post("/order", json={"symbol": "ETHUSDT", "side": "long", "leverage": 100.0, "price": 100.0}).json()["token"]
        c.post("/order/confirm", json={"token": t})
        # now BTC order should be risk-rejected (no room) -> 400, no token
        r = c.post("/order", json={"symbol": "BTCUSDT", "side": "long", "leverage": 100.0, "price": 100.0})
        assert r.status_code == 400 and "token" not in r.json()


# -- 8.6 backtest job ------------------------------------------------------
def test_backtest_job() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        job = c.post("/backtest", json={"symbol": "BTCUSDT", "timeframe": "5m"}).json()
        assert "job_id" in job
        # TestClient runs background tasks synchronously after response.
        status = c.get(f"/jobs/{job['job_id']}").json()
        assert status["status"] in ("done", "running", "error")


# -- 8.7 websocket ---------------------------------------------------------
def test_ws_snapshot() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        with c.websocket_connect("/ws?symbol=BTCUSDT&timeframe=5m&interval=0.01") as ws:
            msg = ws.receive_json()
            assert "price" in msg and "portfolio" in msg


def test_ws_disconnect_clean_and_reconnect() -> None:
    with _tmp() as tmp:
        c = _client(tmp)
        with c.websocket_connect("/ws?interval=0.01") as ws:
            ws.receive_json()
        # server survives the disconnect: a fresh connection still works.
        with c.websocket_connect("/ws?interval=0.01") as ws2:
            assert "price" in ws2.receive_json()


def test_snapshot_injects_live_candle() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        bar = {"open_time": 1700000000000, "open": 100.0, "high": 101.0,
               "low": 99.0, "close": 123.4, "volume": 5.0}
        app = create_app(settings, stream=_FakeStream(bar))
        with TestClient(app).websocket_connect("/ws?symbol=BTCUSDT&timeframe=5m&interval=0.01") as ws:
            msg = ws.receive_json()
        assert msg["price"] == 123.4
        assert msg["last_candle"] == bar


def test_snapshot_fallback_without_live() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        app = create_app(settings, stream=_FakeStream(None))
        with TestClient(app).websocket_connect("/ws?symbol=BTCUSDT&timeframe=5m&interval=0.01") as ws:
            msg = ws.receive_json()
        assert "last_candle" not in msg
        df = ParquetStore(settings.parquet_dir).read(Series("USDT-FUTURES", "BTCUSDT", "5m"))
        assert msg["price"] == float(df["close"].iloc[-1])


def test_candles_recent_returns_stream_batch() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        bars = [
            {"open_time": 1700000000000, "open": 1.0, "high": 2.0, "low": 0.0, "close": 1.5, "volume": 1.0},
            {"open_time": 1700000300000, "open": 1.5, "high": 3.0, "low": 1.0, "close": 2.5, "volume": 2.0},
        ]
        app = create_app(settings, stream=_FakeStream(bars=bars))
        c = TestClient(app)
        r = c.get("/candles/recent", params={"symbol": "ETHUSDT", "timeframe": "5m"}).json()
        assert r["count"] == 2
        assert r["candles"][-1]["close"] == 2.5
        assert r["series"] == "USDT-FUTURES/ETHUSDT/5m"


def test_candles_recent_empty_when_no_stream_data() -> None:
    with _tmp() as tmp:
        settings = _seed(tmp)
        app = create_app(settings, stream=_FakeStream(None))
        c = TestClient(app)
        r = c.get("/candles/recent", params={"symbol": "ETHUSDT", "timeframe": "5m"}).json()
        assert r["count"] == 0 and r["candles"] == []


def test_journal_endpoint() -> None:
    from market_data.memory import TradeJournal, TradeRecord

    with _tmp() as tmp:
        settings = _seed(tmp)
        journal = TradeJournal(settings.data_dir / "memory" / "trades.jsonl")
        journal.append(TradeRecord(
            id="x1", symbol="BTCUSDT", timeframe="5m", side="long",
            entry_price=100.0, exit_price=101.0, notional=5000.0, margin=50.0,
            leverage=100.0, pnl=50.0, opened_at=1, closed_at=2, reflection="win"))
        c = TestClient(create_app(settings))
        trades = c.get("/journal").json()["trades"]
        assert any(t["id"] == "x1" and t["pnl"] == 50.0 for t in trades)


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All webapi tests passed.")


if __name__ == "__main__":
    _run_all()
