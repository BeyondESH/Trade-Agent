"""Offline tests for the global-news background broker (thread + buffer + pub)."""

from __future__ import annotations

import asyncio

from market_data import newsfeed
from market_data.news_broker import NewsBroker


def _mk(source: str, title: str) -> dict:
    return newsfeed.build_item(source, {"title": title, "content": "", "url": None, "ts": 1_700_000_000})


def test_categories_exposed() -> None:
    broker = NewsBroker()
    assert broker.categories == [
        "crypto", "macro", "policy", "a-share",
        "global-market", "industry", "company",
    ]


def test_buffer_ring_limit() -> None:
    broker = NewsBroker(
        buffer_size=2,
        poll_seconds=3600,
        fetcher=lambda s: [_mk(s, f"{s}-{i}") for i in range(3)] if s == "em" else [],
    )
    broker.poll_once()
    items = broker.recent()
    assert len(items) == 2
    assert [i["title"] for i in items] == ["em-1", "em-2"]


def test_publish_to_subscribers() -> None:
    broker = NewsBroker(poll_seconds=3600, fetcher=lambda s: [_mk(s, f"t-{s}")])
    loop = asyncio.new_event_loop()
    broker._loop = loop
    queue: asyncio.Queue = asyncio.Queue()
    broker.subscribe(queue)
    try:
        broker.poll_once()
        got = [loop.run_until_complete(asyncio.wait_for(queue.get(), timeout=1)) for _ in range(4)]
        assert {g["source"] for g in got} == {"em", "sina", "ths", "cls"}
    finally:
        broker.unsubscribe(queue)
        loop.close()


def test_single_source_failure_isolated() -> None:
    def fetcher(source: str) -> list[dict]:
        if source == "sina":
            raise RuntimeError("boom")
        return [_mk(source, f"t-{source}")]

    broker = NewsBroker(poll_seconds=3600, fetcher=fetcher)
    broker.poll_once()
    items = broker.recent()
    assert len(items) == 3  # em/ths/cls still delivered

    health = broker.health()["sources"]
    assert health["sina"]["failures"] == 1
    assert "boom" in health["sina"]["last_error"]
    assert health["em"]["failures"] == 0
    assert health["em"]["last_ts"] is not None


def test_backoff_skips_failing_source() -> None:
    calls: dict[str, int] = {}

    def fetcher(source: str) -> list[dict]:
        calls[source] = calls.get(source, 0) + 1
        if source == "sina":
            raise RuntimeError("boom")
        return [_mk(source, f"t-{source}")]

    broker = NewsBroker(poll_seconds=60, fetcher=fetcher)
    skip: dict[str, float] = {}
    broker.poll_once(skip)
    assert skip["sina"] > 0
    broker.poll_once(skip)
    assert calls["sina"] == 1  # skipped on the second cycle
    assert calls["em"] == 2


def test_stop_graceful() -> None:
    broker = NewsBroker(poll_seconds=1, fetcher=lambda _s: [])
    broker.start()
    assert broker._thread is not None and broker._thread.is_alive()
    broker.stop()
    assert broker._thread is None


def _mk_ts(source: str, ts: int) -> dict:
    item = _mk(source, f"{source}-{ts}")
    item["ts"] = ts
    return item


def test_snapshot_newest_first_and_capped() -> None:
    broker = NewsBroker(
        buffer_size=200,
        poll_seconds=3600,
        fetcher=lambda s: [_mk_ts(s, ts) for ts in range(0, 150, 10)] if s == "em" else [],
    )
    broker.poll_once()
    items, total = broker.snapshot()
    assert total == 15
    assert len(items) == 15  # below the cap -> everything, newest first
    assert items[0]["ts"] == 140 and items[-1]["ts"] == 0

    capped, _ = broker.snapshot(max_items=5)
    assert len(capped) == 5
    assert [i["ts"] for i in capped] == [140, 130, 120, 110, 100]


def test_page_pagination_filters_and_bounds() -> None:
    broker = NewsBroker(
        buffer_size=100,
        poll_seconds=3600,
        fetcher=lambda s: [_mk_ts(s, ts) for ts in range(10, 101, 10)] if s == "em" else [],
    )
    broker.poll_once()
    items, total = broker.page()
    assert total == 10
    assert [i["ts"] for i in items] == [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]

    page, total = broker.page(offset=2, limit=3)
    assert [i["ts"] for i in page] == [80, 70, 60]
    assert total == 10

    # out-of-range offset -> empty items, total preserved
    page, total = broker.page(offset=100)
    assert page == [] and total == 10


def test_page_category_filter() -> None:
    def fetcher(source: str) -> list[dict]:
        if source == "em":
            a = _mk_ts(source, 10)
            a["category"] = "macro"
            b = _mk_ts(source, 20)
            b["category"] = "crypto"
            return [a, b]
        return []

    broker = NewsBroker(poll_seconds=3600, fetcher=fetcher)
    broker.poll_once()
    items, total = broker.page(categories="macro")
    assert len(items) == 1 and items[0]["ts"] == 10
    assert total == 1

    items, total = broker.page(categories="macro,crypto")
    assert total == 2
