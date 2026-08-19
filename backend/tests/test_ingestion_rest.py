"""Offline tests for the Bitget v2 REST deep-history backfill (KlineIngestor).

Run:
    python tests/test_ingestion_rest.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from market_data import ingestion as ingestion_mod
from market_data.ingestion import KlineIngestor, V2RestError
from market_data.models import Series
from market_data.store import ParquetStore

BASE = 1_700_000_000_000
STEP = 300_000


def _row(ts: int) -> list:
    return [ts, 1, 2, 0, 1, 1]


def _make_ingestor(tmp: str, page_limit: int = 3) -> tuple[ParquetStore, KlineIngestor]:
    store = ParquetStore(Path(tmp))
    ing = KlineIngestor(None, store, page_limit=page_limit)
    return store, ing


def test_rest_backfill_paginates_and_saves_gapless() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store, ing = _make_ingestor(tmp)
        series = Series("USDT-FUTURES", "BTCUSDT", "5m")
        pages = [
            [_row(BASE - 1 * STEP), _row(BASE - 2 * STEP), _row(BASE - 3 * STEP)],
            [_row(BASE - 4 * STEP), _row(BASE - 5 * STEP), _row(BASE - 6 * STEP)],
        ]
        calls: list[tuple[int, int]] = []

        def fake_fetch(category, symbol, granularity, end_ms, limit):  # noqa: ANN001, ARG001
            calls.append((end_ms, limit))
            return pages.pop(0) if pages else []

        appended, earliest = ing.backfill_before_rest(
            series, BASE, fetch_page=fake_fetch, max_pages=2, page_delay=0.0
        )
        assert earliest is False
        assert appended == 6
        assert calls == [(BASE, 3), (BASE - 4 * STEP, 3)]
        df = store.read(series)
        times = [int(t) for t in df["open_time"].tolist()]
        assert times == [BASE - 6 * STEP, BASE - 5 * STEP, BASE - 4 * STEP,
                         BASE - 3 * STEP, BASE - 2 * STEP, BASE - 1 * STEP]


def test_rest_backfill_retries_empty_page_then_saves() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store, ing = _make_ingestor(tmp)
        series = Series("USDT-FUTURES", "BTCUSDT", "5m")
        state = {"calls": 0}

        def fake_fetch(category, symbol, granularity, end_ms, limit):  # noqa: ANN001, ARG001
            state["calls"] += 1
            if state["calls"] == 1:
                return []  # transient empty -> retried once
            return [_row(BASE - 1 * STEP), _row(BASE - 2 * STEP)]

        sleeps: list[float] = []
        appended, earliest = ing.backfill_before_rest(
            series, BASE, fetch_page=fake_fetch, max_pages=1,
            backoff_base=0.25, page_delay=0.0, sleep=lambda s: sleeps.append(s),
        )
        assert appended == 2
        assert earliest is False  # retry succeeded; pagination completed normally
        assert state["calls"] == 2  # empty attempt + successful retry
        assert sleeps == [0.2]  # empty-page retry pause capped at 0.2s


def test_rest_backfill_empty_after_retry_is_earliest() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store, ing = _make_ingestor(tmp)
        series = Series("USDT-FUTURES", "BTCUSDT", "5m")

        def fake_fetch(category, symbol, granularity, end_ms, limit):  # noqa: ANN001, ARG001
            return []

        sleeps: list[float] = []
        appended, earliest = ing.backfill_before_rest(
            series, BASE, fetch_page=fake_fetch, max_pages=3,
            backoff_base=0.1, page_delay=0.0, sleep=lambda s: sleeps.append(s),
        )
        assert appended == 0
        assert earliest is True
        assert len(sleeps) == 1  # one backoff pause for the empty-page retry


def test_rest_backfill_short_page_does_not_stop() -> None:
    """A page shorter than the limit (the v2 endpoint serves a 90-day window)
    is NOT the history end: the cursor keeps walking and only an empty page
    after a retry stops backfill."""
    with tempfile.TemporaryDirectory() as tmp:
        store, ing = _make_ingestor(tmp, page_limit=5)
        series = Series("USDT-FUTURES", "BTCUSDT", "5m")
        state = {"calls": 0}

        def fake_fetch(category, symbol, granularity, end_ms, limit):  # noqa: ANN001, ARG001
            state["calls"] += 1
            if state["calls"] == 1:
                return [_row(BASE - 1 * STEP), _row(BASE - 2 * STEP), _row(BASE - 3 * STEP)]
            if state["calls"] == 2:
                return [_row(BASE - 4 * STEP), _row(BASE - 5 * STEP), _row(BASE - 6 * STEP)]
            return []

        sleeps: list[float] = []
        appended, earliest = ing.backfill_before_rest(
            series, BASE, fetch_page=fake_fetch, max_pages=4,
            backoff_base=0.05, page_delay=0.0, sleep=lambda s: sleeps.append(s),
        )
        assert appended == 6  # walked past the short page to older data
        assert earliest is True  # stopped on an empty page after retry
        assert state["calls"] >= 3
        assert sleeps  # empty-page backoff fired


def test_rest_backfill_rate_limit_retries_then_succeeds() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store, ing = _make_ingestor(tmp)
        series = Series("USDT-FUTURES", "BTCUSDT", "5m")
        state = {"calls": 0}

        def fake_fetch(category, symbol, granularity, end_ms, limit):  # noqa: ANN001, ARG001
            state["calls"] += 1
            if state["calls"] == 1:
                raise V2RestError("rate limit: 429")
            return [_row(BASE - 1 * STEP), _row(BASE - 2 * STEP), _row(BASE - 3 * STEP)]

        sleeps: list[float] = []
        appended, earliest = ing.backfill_before_rest(
            series, BASE, fetch_page=fake_fetch, max_pages=2,
            max_retries=2, backoff_base=0.1, page_delay=0.0,
            sleep=lambda s: sleeps.append(s),
        )
        assert appended == 3
        assert state["calls"] >= 2  # rate-limited attempt was retried
        assert sleeps  # at least one backoff pause recorded


def test_rest_backfill_parallel_merges_and_dedupes() -> None:
    """Parallel pages over a pre-computed cursor chain merge into gapless rows."""
    with tempfile.TemporaryDirectory() as tmp:
        store, ing = _make_ingestor(tmp, page_limit=3)
        series = Series("USDT-FUTURES", "BTCUSDT", "5m")
        # window = min(90d, 3*5m) = 15min = 3*STEP -> cursors BASE, BASE-3STEP, BASE-6STEP

        def fake_fetch(category, symbol, granularity, end_ms, limit):  # noqa: ANN001, ARG001
            return [[end_ms - i * STEP, 1, 2, 0, 1, 1] for i in range(1, 4)]

        appended, earliest = ing.backfill_before_rest(
            series, BASE, fetch_page=fake_fetch, max_pages=3, parallel=True,
        )
        assert earliest is False
        assert appended == 9  # BASE-1 .. BASE-9, contiguous
        df = store.read(series)
        times = [int(t) for t in df["open_time"].tolist()]
        assert times == [BASE - i * STEP for i in range(9, 0, -1)]


def test_rest_backfill_parallel_oldest_empty_is_earliest() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store, ing = _make_ingestor(tmp, page_limit=3)
        series = Series("USDT-FUTURES", "BTCUSDT", "5m")

        def fake_fetch(category, symbol, granularity, end_ms, limit):  # noqa: ANN001, ARG001
            if end_ms == BASE:
                return [[BASE - i * STEP, 1, 2, 0, 1, 1] for i in range(1, 4)]
            return []

        appended, earliest = ing.backfill_before_rest(
            series, BASE, fetch_page=fake_fetch, max_pages=3,
            backoff_base=0.05, parallel=True,
        )
        assert appended == 3
        assert earliest is True


def test_v2_fetch_page_params(monkeypatch) -> None:  # noqa: ANN001
    captured: dict = {}

    class _Resp:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"code": "00000", "data": []}

    def fake_get(url, params=None, timeout=None):  # noqa: ANN001, ARG001
        captured["url"] = url
        captured["params"] = params
        return _Resp()

    monkeypatch.setattr(ingestion_mod.httpx, "get", fake_get)

    KlineIngestor._fetch_v2_page("USDT-FUTURES", "BTCUSDT", "5m", 12345, 500)
    assert "mix/market/candles" in captured["url"]
    assert captured["params"]["productType"] == "USDT-FUTURES"
    assert captured["params"]["limit"] == "500"  # passed through up to the 1000 cap

    KlineIngestor._fetch_v2_page("SPOT", "XAUUSDT", "1D", 12345, 100)
    assert "spot/market/candles" in captured["url"]
    assert "productType" not in captured["params"]
    assert captured["params"]["limit"] == "100"


def test_v2_fetch_page_http_429_raises_rate_limit(monkeypatch) -> None:  # noqa: ANN001
    import httpx

    class _Resp:
        status_code = 429

        def raise_for_status(self) -> None:
            raise httpx.HTTPStatusError("429", request=None, response=self)  # type: ignore[arg-type]

    def fake_get(url, params=None, timeout=None):  # noqa: ANN001, ARG001
        return _Resp()

    monkeypatch.setattr(ingestion_mod.httpx, "get", fake_get)
    try:
        KlineIngestor._fetch_v2_page("USDT-FUTURES", "BTCUSDT", "5m", 12345, 100)
        raise AssertionError("expected V2RestError")
    except V2RestError as exc:
        assert "rate limit" in str(exc).lower()


def test_v3_fetch_page_params_and_100_cap(monkeypatch) -> None:  # noqa: ANN001
    """v3 history-candles uses `category` and caps `limit` at 100."""
    captured: dict = {}

    class _Resp:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"code": "00000", "data": []}

    def fake_get(url, params=None, timeout=None):  # noqa: ANN001, ARG001
        captured["url"] = url
        captured["params"] = params
        return _Resp()

    monkeypatch.setattr(ingestion_mod.httpx, "get", fake_get)

    KlineIngestor._fetch_v3_history_page("USDT-FUTURES", "BTCUSDT", "1H", 12345, 500)
    assert "history-candles" in captured["url"]
    assert captured["params"]["category"] == "USDT-FUTURES"
    assert captured["params"]["interval"] == "1H"
    assert captured["params"]["limit"] == "100"  # capped, not 500


def test_v3_fetch_page_rate_limit_message_raises(monkeypatch) -> None:  # noqa: ANN001
    """Non-200 / rate-limit-style messages surface as V2RestError (rate limit)."""

    class _Resp:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"code": "40017", "msg": "Request frequency too high"}

    def fake_get(url, params=None, timeout=None):  # noqa: ANN001, ARG001
        return _Resp()

    monkeypatch.setattr(ingestion_mod.httpx, "get", fake_get)
    try:
        KlineIngestor._fetch_v3_history_page("USDT-FUTURES", "BTCUSDT", "1H", 12345, 100)
        raise AssertionError("expected V2RestError")
    except V2RestError as exc:
        assert "rate limit" in str(exc).lower()


def test_v3_fetch_page_error_code_raises(monkeypatch) -> None:  # noqa: ANN001
    class _Resp:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"code": "00001", "msg": "startTime and endTime interval cannot be greater than 90 day"}

    def fake_get(url, params=None, timeout=None):  # noqa: ANN001, ARG001
        return _Resp()

    monkeypatch.setattr(ingestion_mod.httpx, "get", fake_get)
    try:
        KlineIngestor._fetch_v3_history_page("USDT-FUTURES", "BTCUSDT", "1H", 12345, 100)
        raise AssertionError("expected V2RestError")
    except V2RestError as exc:
        assert "v3 history-candles error" in str(exc)


def test_backfill_rest_default_fetcher_is_v3(monkeypatch) -> None:  # noqa: ANN001
    """backfill_before_rest defaults to the v3 history-candles fetcher."""
    with tempfile.TemporaryDirectory() as tmp:
        store, ing = _make_ingestor(tmp, page_limit=100)
        series = Series("USDT-FUTURES", "BTCUSDT", "5m")
        captured: dict = {}

        def fake_v3(category, symbol, granularity, end_ms, limit):  # noqa: ANN001, ARG001
            captured["fn"] = "v3"
            captured["granularity"] = granularity
            captured["limit"] = limit
            return []

        monkeypatch.setattr(ingestion_mod.KlineIngestor, "_fetch_v3_history_page", staticmethod(fake_v3))
        appended, earliest = ing.backfill_before_rest(
            series, BASE, max_pages=1, page_delay=0.0, parallel=False,
            max_retries=1, backoff_base=0.05, sleep=lambda s: None,
        )
        assert appended == 0
        assert earliest is True  # v3 empty page (after retry) is the history end
        assert captured["fn"] == "v3"
        assert captured["granularity"] == "5m"
        assert captured["limit"] == 100


def test_rest_backfill_parallel_v3_window_and_merges() -> None:
    """Parallel v3 backfill: cursor window follows page_limit=100, merge dedupes."""
    with tempfile.TemporaryDirectory() as tmp:
        store, ing = _make_ingestor(tmp, page_limit=100)
        series = Series("USDT-FUTURES", "BTCUSDT", "5m")
        # window = min(90d, 100*5m = 500min) -> cursors spaced 100*STEP apart.
        cursor_calls: list[int] = []

        def fake_fetch(category, symbol, granularity, end_ms, limit):  # noqa: ANN001, ARG001
            cursor_calls.append(end_ms)
            return [[end_ms - i * STEP, 1, 2, 0, 1, 1] for i in range(1, 4)]

        appended, earliest = ing.backfill_before_rest(
            series, BASE, fetch_page=fake_fetch, max_pages=3, parallel=True,
        )
        assert earliest is False
        assert appended == 9  # 3 pages x 3 rows, contiguous, deduped
        assert cursor_calls == [BASE, BASE - 100 * STEP, BASE - 200 * STEP]


def test_rest_backfill_parallel_v3_oldest_empty_is_earliest() -> None:
    """With the v3 fetcher an empty oldest cursor still means 'reached the start'."""
    with tempfile.TemporaryDirectory() as tmp:
        store, ing = _make_ingestor(tmp, page_limit=100)
        series = Series("USDT-FUTURES", "BTCUSDT", "5m")

        def fake_fetch(category, symbol, granularity, end_ms, limit):  # noqa: ANN001, ARG001
            if end_ms == BASE:
                return [[BASE - i * STEP, 1, 2, 0, 1, 1] for i in range(1, 4)]
            return []

        appended, earliest = ing.backfill_before_rest(
            series, BASE, fetch_page=fake_fetch, max_pages=3,
            backoff_base=0.05, parallel=True,
        )
        assert appended == 3
        assert earliest is True
