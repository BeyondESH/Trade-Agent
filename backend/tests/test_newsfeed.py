"""Offline tests for global news ingestion (normalization + classification).

The akshare library is never imported here; the four source adapters are
driven with fake `ak` objects returning canned DataFrames.
"""

from __future__ import annotations

from datetime import datetime

import pandas as pd
import pytest

from market_data import newsfeed
from market_data.newsfeed import (
    CATEGORY_RULES,
    BEIJING,
    build_item,
    classify,
    fetch_all,
    fetch_source,
)

EXPECTED_ORDER = [
    "crypto",
    "macro",
    "policy",
    "a-share",
    "global-market",
    "industry",
    "company",
]


class _FakeAK:
    """Canned DataFrames shaped like the real akshare news endpoints."""

    def __init__(self, *, fail: set[str] | None = None) -> None:
        self.fail = fail or set()
        self.calls: list[str] = []

    def _maybe(self, source: str) -> None:
        self.calls.append(source)
        if source in self.fail:
            raise RuntimeError(f"upstream down: {source}")

    def stock_info_global_em(self) -> pd.DataFrame:  # noqa: D102
        self._maybe("em")
        return pd.DataFrame([
            {"标题": "比特币突破7万美元", "摘要": "加密货币大涨，以太坊跟涨",
             "发布时间": "2026-08-20 15:00:00", "链接": "https://em.example"},
        ])

    def stock_info_global_sina(self) -> pd.DataFrame:  # noqa: D102
        self._maybe("sina")
        return pd.DataFrame([
            {"时间": "2026-08-20 14:59:00", "内容": "美联储维持利率不变，市场反应平淡"},
        ])

    def stock_info_global_ths(self) -> pd.DataFrame:  # noqa: D102
        self._maybe("ths")
        return pd.DataFrame([
            {"标题": "A股三大指数震荡", "内容": "沪指微跌，创业板翻红",
             "时间": "2026-08-20 14:58:00", "链接": "https://ths.example"},
        ])

    def stock_telegraph_cls(self) -> pd.DataFrame:  # noqa: D102
        self._maybe("cls")
        return pd.DataFrame([
            {"标题": "某公司发布财报", "内容": "营收净利双增",
             "发布日期": "2026-08-20", "发布时间": "14:57:00", "链接": "https://cls.example"},
        ])


def test_categories_order() -> None:
    assert [c for c, _ in CATEGORY_RULES] == EXPECTED_ORDER


def test_classify_priority() -> None:
    # crypto is checked before macro, so the first hit wins.
    assert classify("美联储降息，比特币大涨") == "crypto"
    assert classify("比特币突破新高") == "crypto"
    assert classify("美联储维持利率不变") == "macro"


def test_classify_fallback() -> None:
    assert classify("今日天气晴朗") == "other"


def test_build_item_id_stable() -> None:
    row = {"title": "标题", "content": "内容", "url": None, "ts": 1000}
    a = build_item("em", row)
    b = build_item("em", dict(row))
    assert a["id"] == b["id"]
    assert a["id"].startswith("em_")
    c = build_item("em", {"title": "标题", "content": "另一条", "url": None, "ts": 1000})
    assert c["id"] != a["id"]


def test_fetch_em_normalized() -> None:
    rows = fetch_source("em", _FakeAK())
    assert len(rows) == 1
    item = rows[0]
    assert item["source"] == "em"
    assert item["title"] == "比特币突破7万美元"
    assert item["category"] == "crypto"
    assert item["url"] == "https://em.example"
    expected_ts = int(datetime(2026, 8, 20, 15, 0, tzinfo=BEIJING).timestamp())
    assert item["ts"] == expected_ts


def test_fetch_sina_uses_content_as_title() -> None:
    rows = fetch_source("sina", _FakeAK())
    item = rows[0]
    assert item["title"] == "美联储维持利率不变，市场反应平淡"
    assert item["content"] == ""
    assert item["url"] is None
    assert item["category"] == "macro"


def test_fetch_ths_normalized() -> None:
    rows = fetch_source("ths", _FakeAK())
    item = rows[0]
    assert item["source"] == "ths"
    assert item["category"] == "a-share"
    assert item["url"] == "https://ths.example"


def test_fetch_cls_combines_date_time() -> None:
    rows = fetch_source("cls", _FakeAK())
    item = rows[0]
    expected_ts = int(datetime(2026, 8, 20, 14, 57, tzinfo=BEIJING).timestamp())
    assert item["ts"] == expected_ts
    assert item["category"] == "company"


def test_fetch_all_isolation() -> None:
    fake = _FakeAK(fail={"sina", "cls"})
    items_by_source, errors = fetch_all(fake)
    assert set(errors) == {"sina", "cls"}
    assert items_by_source["sina"] == []
    assert len(items_by_source["em"]) == 1
    assert len(items_by_source["ths"]) == 1
    assert "sina" in errors and "upstream down" in errors["sina"]
    assert fake.calls == ["em", "sina", "ths", "cls"]
