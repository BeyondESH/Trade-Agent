"""Offline tests for trade memory & reflection.

Run:
    python tests/test_memory.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from market_data.memory import (
    MemoryStore,
    Reflector,
    TradeJournal,
    TradeRecord,
    augment_context,
    features_from_context,
    similarity,
)


def _trade(tid, side="long", pnl=10.0, macd_sign=1, closed=True) -> TradeRecord:
    return TradeRecord(
        id=tid, symbol="BTCUSDT", timeframe="1d", side=side,
        entry_price=100.0, exit_price=(101.0 if closed else None),
        notional=5000.0, margin=50.0, leverage=100.0,
        pnl=(pnl if closed else None), opened_at=1, closed_at=(2 if closed else None),
        reason="near support", features={"macd_sign": macd_sign, "kdj_zone": "low",
                                         "dist_to_support_pct": 0.001,
                                         "dist_to_resistance_pct": 0.02},
    )


# -- 7.1 journal -----------------------------------------------------------
def test_journal_roundtrip_and_closed() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        j = TradeJournal(Path(tmp) / "trades.jsonl")
        j.append(_trade("a"))
        j.append(_trade("b", closed=False))
        allr = j.all()
        assert len(allr) == 2
        assert {r.id for r in allr} == {"a", "b"}
        assert [r.id for r in j.closed()] == ["a"]


# -- 7.2 similarity + retrieval -------------------------------------------
def test_similarity_high_and_low() -> None:
    a = {"macd_sign": 1, "kdj_zone": "low", "dist_to_support_pct": 0.001, "dist_to_resistance_pct": 0.02}
    same = dict(a)
    diff = {"macd_sign": -1, "kdj_zone": "high", "dist_to_support_pct": 0.5, "dist_to_resistance_pct": 0.5}
    assert similarity(a, same) > 0.95
    assert similarity(a, diff) < similarity(a, same)


def test_retrieve_topk_and_side_filter() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        j = TradeJournal(Path(tmp) / "t.jsonl")
        j.append(_trade("l1", side="long", macd_sign=1))
        j.append(_trade("l2", side="long", macd_sign=-1))
        j.append(_trade("s1", side="short", macd_sign=1))
        store = MemoryStore(j)
        feats = {"macd_sign": 1, "kdj_zone": "low", "dist_to_support_pct": 0.001,
                 "dist_to_resistance_pct": 0.02}
        longs = store.retrieve(feats, k=2, side="long")
        assert all(t.side == "long" for t in longs)
        assert longs[0].id == "l1"  # most similar (macd_sign matches)


def test_retrieve_empty_history() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = MemoryStore(TradeJournal(Path(tmp) / "none.jsonl"))
        assert store.retrieve({"macd_sign": 1}, k=3) == []


# -- 7.3 reflection --------------------------------------------------------
def test_reflect_heuristic() -> None:
    txt = Reflector().reflect(_trade("a", pnl=25.0))
    assert "win" in txt and "BTCUSDT" in txt


def test_reflect_llm_fallback() -> None:
    def boom(system, user):  # noqa: ANN001
        raise RuntimeError("llm down")
    txt = Reflector().reflect(_trade("a", pnl=-5.0), complete=boom)
    assert "loss" in txt  # fell back to heuristic


# -- 7.4 param suggestions -------------------------------------------------
def test_suggest_on_low_winrate() -> None:
    trades = [_trade(f"t{i}", pnl=-1.0) for i in range(6)]  # all losses
    sug = Reflector().suggest_param_adjustments(trades)
    assert sug and sug.get("min_strength") == "+1"


def test_no_suggest_insufficient_samples() -> None:
    trades = [_trade("t0", pnl=-1.0)]
    assert Reflector().suggest_param_adjustments(trades) == {}


# -- 7.5 rule distillation -------------------------------------------------
def test_distill_rules_losing_long_neg_macd() -> None:
    trades = [_trade(f"t{i}", side="long", pnl=-1.0, macd_sign=-1) for i in range(2)]
    rules = Reflector().distill_rules(trades)
    assert any("long" in r.lower() for r in rules)


# -- 7.6 augment context ---------------------------------------------------
def test_augment_context_injects() -> None:
    ctx = {"symbol": "BTCUSDT", "price": 100.0}
    out = augment_context(ctx, [_trade("a")], ["rule x"])
    assert len(out["memories"]) == 1 and out["rules"] == ["rule x"]


def test_augment_context_empty_compatible() -> None:
    ctx = {"symbol": "BTCUSDT", "price": 100.0}
    out = augment_context(ctx, [], [])
    assert out["memories"] == [] and out["rules"] == []
    assert out["symbol"] == "BTCUSDT"  # original preserved


def test_features_from_context() -> None:
    ctx = {
        "price": 100.0,
        "indicators": {"macd_hist": -5.0, "kdj_j": 10.0},
        "levels": [{"price": 99.9, "kind": "support"}, {"price": 102.0, "kind": "resistance"}],
    }
    f = features_from_context(ctx)
    assert f["macd_sign"] == -1 and f["kdj_zone"] == "low"
    assert f["dist_to_support_pct"] < 0.01


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All memory tests passed.")


if __name__ == "__main__":
    _run_all()
