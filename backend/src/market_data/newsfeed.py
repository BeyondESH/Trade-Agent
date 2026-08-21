"""Global news ingestion: AKShare sources -> normalized items + topic tags.

AKShare aggregates 7x24 flash news from East Money (`em`), Sina (`sina`),
Tonghuashun (`ths`) and CLS (`cls`) with no API key or registration. Each
source returns a pandas DataFrame with source-specific columns; this module
normalizes every row into one stable item shape and classifies it into a
single topic category.

All `akshare` access is confined to the adapter functions below, and the
library is imported lazily (never at module import time), so a version change
or an install without akshare degrades gracefully instead of breaking boot.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

logger = logging.getLogger(__name__)

# Chinese flash sources publish Beijing time (UTC+8, no DST).
BEIJING = timezone(timedelta(hours=8))

# Ordered topic rules; the first keyword hit wins (title + content merged).
# High-signal categories first: crypto/macro are the most actionable for a
# trading agent, and A-share individual-stock noise ranks low.
CATEGORY_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "crypto",
        (
            "比特币", "以太坊", "区块链", "加密", "虚拟货币", "数字货币", "稳定币",
            "Web3", "ETF", "Coinbase", "币安", "Binance", "链上", "交易所",
            "加密货币", "代币",
        ),
    ),
    (
        "macro",
        (
            "美联储", "央行", "降息", "加息", "CPI", "PPI", "GDP", "非农",
            "就业", "通胀", "美元", "美债", "国债收益率", "黄金", "原油", "石油",
        ),
    ),
    (
        "policy",
        (
            "证监会", "国务院", "发改委", "财政部", "监管", "政策", "牌照",
            "条例", "新规", "审核", "批准", "立案",
        ),
    ),
    (
        "a-share",
        (
            "A股", "沪指", "深成指", "创业板", "上证", "深证", "板块", "涨停",
            "跌停", "北向", "主力", "大盘", "个股",
        ),
    ),
    (
        "global-market",
        (
            "美股", "道指", "纳指", "标普", "港股", "恒指", "欧股", "日经",
            "亚太", "亚洲股市", "美国股市",
        ),
    ),
    (
        "industry",
        (
            "半导体", "新能源", "光伏", "锂电", "芯片", "人工智能", "AI", "医药",
            "汽车", "消费", "地产", "房地产", "钢铁", "科技",
        ),
    ),
    (
        "company",
        (
            "财报", "业绩", "并购", "收购", "增持", "减持", "回购", "营收",
            "净利", "亏损", "分红", "中标", "合作",
        ),
    ),
)

# Source key -> the akshare function that provides the raw flash feed.
SOURCES: dict[str, Callable[[Any], list[dict]]] = {}


def _str(v: Any) -> str:
    return "" if v is None else str(v).strip()


def _parse_ts(raw: Any) -> int:
    """Parse a source timestamp into epoch seconds.

    Numeric values are treated as epoch seconds (or milliseconds when they are
    clearly in the ms range); strings are parsed as Beijing time.
    """
    if isinstance(raw, (int, float)):
        return int(raw) if raw < 1e12 else int(raw // 1000)
    s = _str(raw)
    if not s:
        return int(datetime.now(timezone.utc).timestamp())
    dt: datetime | None = None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s, fmt)
            break
        except ValueError:
            dt = None
    if dt is None:
        return int(datetime.now(timezone.utc).timestamp())
    return int(dt.replace(tzinfo=BEIJING).timestamp())


def classify(text: str) -> str:
    """Single-label topic classification; first keyword hit wins, else 'other'."""
    for category, keywords in CATEGORY_RULES:
        for keyword in keywords:
            if keyword in text:
                return category
    return "other"


def _item_id(source: str, text: str) -> str:
    digest = hashlib.sha1(f"{source}:{text}".encode("utf-8")).hexdigest()[:8]
    return f"{source}_{digest}"


def build_item(source: str, row: dict) -> dict:
    """Normalize one source row into the stable global-news item shape."""
    title = _str(row.get("title"))
    content = _str(row.get("content"))
    text = f"{title} {content}"
    return {
        "id": _item_id(source, text),
        "source": source,
        "category": classify(text),
        "title": title,
        "content": content,
        "url": (_str(row.get("url")) or None),
        "ts": int(row.get("ts") or 0),
    }


# -- source adapters (each maps one akshare DataFrame to normalized rows) ---

def _fetch_em(ak: Any) -> list[dict]:
    """East Money global finance flash: 标题 / 摘要 / 发布时间 / 链接."""
    df = ak.stock_info_global_em()
    out: list[dict] = []
    for _, row in df.iterrows():
        title = _str(row.get("标题"))
        content = _str(row.get("摘要"))
        if not title and not content:
            continue
        out.append({
            "title": title,
            "content": content,
            "url": _str(row.get("链接")) or None,
            "ts": _parse_ts(row.get("发布时间")),
        })
    return out


def _fetch_sina(ak: Any) -> list[dict]:
    """Sina global finance flash: 时间 / 内容."""
    df = ak.stock_info_global_sina()
    out: list[dict] = []
    for _, row in df.iterrows():
        content = _str(row.get("内容"))
        if not content:
            continue
        out.append({
            "title": content,
            "content": "",
            "url": None,
            "ts": _parse_ts(row.get("时间")),
        })
    return out


def _fetch_ths(ak: Any) -> list[dict]:
    """Tonghuashun global finance live: 标题 / 内容 / 时间 / 链接."""
    df = ak.stock_info_global_ths()
    out: list[dict] = []
    for _, row in df.iterrows():
        title = _str(row.get("标题"))
        content = _str(row.get("内容"))
        if not title and not content:
            continue
        out.append({
            "title": title,
            "content": content,
            "url": _str(row.get("链接")) or None,
            "ts": _parse_ts(row.get("时间")),
        })
    return out


def _fetch_cls(ak: Any) -> list[dict]:
    """CLS telegraph: 标题 / 内容 / 发布日期 / 发布时间 / 链接."""
    df = ak.stock_telegraph_cls()
    out: list[dict] = []
    for _, row in df.iterrows():
        title = _str(row.get("标题"))
        content = _str(row.get("内容"))
        if not title and not content:
            continue
        date = _str(row.get("发布日期"))
        time = _str(row.get("发布时间"))
        ts_raw = f"{date} {time}".strip() if date else time
        out.append({
            "title": title,
            "content": content,
            "url": _str(row.get("链接")) or None,
            "ts": _parse_ts(ts_raw),
        })
    return out


SOURCES = {
    "em": _fetch_em,
    "sina": _fetch_sina,
    "ths": _fetch_ths,
    "cls": _fetch_cls,
}


def import_akshare() -> Any:
    """Lazily import akshare (slow; call from the worker thread, never at boot)."""
    import akshare  # noqa: PLC0415

    return akshare


def fetch_source(source: str, ak: Any) -> list[dict]:
    """Fetch and normalize one source; raises on upstream failure."""
    adapter = SOURCES[source]
    rows = adapter(ak)
    return [build_item(source, row) for row in rows]


def fetch_all(ak: Any = None) -> tuple[dict[str, list[dict]], dict[str, str]]:
    """Fetch every source with per-source failure isolation.

    Returns `(items_by_source, errors)`; a failing source never aborts the
    remaining sources.
    """
    ak = ak or import_akshare()
    items_by_source: dict[str, list[dict]] = {}
    errors: dict[str, str] = {}
    for source in SOURCES:
        try:
            items_by_source[source] = fetch_source(source, ak)
        except Exception as exc:  # noqa: BLE001 - per-source isolation
            errors[source] = str(exc)
            items_by_source[source] = []
            logger.warning("news source %s failed: %s", source, exc)
    return items_by_source, errors
