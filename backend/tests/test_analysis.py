"""Offline tests for the indicator + structure + SMC + levels engines.

Run:
    python tests/test_analysis.py     # from backend/ with PYTHONPATH=src
    pytest
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from market_data import indicators, levels
from market_data.smc import bos_choch, liquidity_levels, order_blocks
from market_data.structure import detect_box, find_swings, fit_trendlines
BASE = 1_700_000_000_000
STEP = 300_000


def _df(closes, highs=None, lows=None, opens=None) -> pd.DataFrame:
    n = len(closes)
    closes = np.array(closes, dtype="float64")
    highs = np.array(highs if highs is not None else closes + 1.0, dtype="float64")
    lows = np.array(lows if lows is not None else closes - 1.0, dtype="float64")
    opens = np.array(opens if opens is not None else closes, dtype="float64")
    return pd.DataFrame(
        {
            "open_time": [BASE + i * STEP for i in range(n)],
            "open": opens,
            "high": highs,
            "low": lows,
            "close": closes,
            "volume": [1.0] * n,
        }
    )


# -- 6.1 indicators --------------------------------------------------------
def test_ema_constant() -> None:
    s = pd.Series([100.0] * 30)
    assert abs(indicators.ema(s, 5).iloc[-1] - 100.0) < 1e-9


def test_macd_uptrend_positive() -> None:
    df = _df(list(range(1, 61)))
    out = indicators.macd(df["close"])
    assert out["dif"].iloc[-1] > 0, "uptrend should give positive DIF"


def test_bollinger_constant() -> None:
    df = _df([100.0] * 30)
    b = indicators.bollinger(df["close"]).iloc[-1]
    assert abs(b["boll_mid"] - 100.0) < 1e-9
    assert abs(b["boll_upper"] - b["boll_mid"]) < 1e-9  # std == 0


def test_kdj_in_range() -> None:
    df = _df(list(range(1, 61)))
    k = indicators.kdj(df["high"], df["low"], df["close"]).iloc[-1]
    assert 0.0 <= k["kdj_k"] <= 100.0 and np.isfinite(k["kdj_j"])


def test_fib_midpoint() -> None:
    df = _df([100.0 + (i % 10) for i in range(120)],
             highs=[110.0] * 120, lows=[100.0] * 120)
    fib = indicators.fib_levels(df["high"], df["low"])
    assert abs(fib[0.5] - 105.0) < 1e-9  # (110+100)/2


def test_insufficient_data_no_error() -> None:
    df = _df([100.0, 101.0, 102.0])
    out = indicators.compute(df)  # must not raise
    assert np.isnan(out["boll_mid"].iloc[-1])  # not enough for 20-window


def test_rsi_atr_insufficient_nan() -> None:
    df = _df([100.0, 101.0, 102.0])
    assert np.isnan(indicators.rsi(df["close"], 14).iloc[-1])
    assert np.isnan(indicators.atr(df["high"], df["low"], df["close"], 14).iloc[-1])


def test_indicators_deterministic() -> None:
    df = _df(list(range(1, 61)))
    a = indicators.compute(df)
    b = indicators.compute(df)
    assert a.equals(b)


def test_indicator_no_lookahead() -> None:
    """A value at bar t must be identical whether or not future bars exist."""
    full = _df(list(range(1, 81)))
    prefix = full.iloc[:40]
    for col in ("boll_mid", "boll_upper", "rsi", "atr"):
        if col == "rsi":
            v_full = indicators.rsi(full["close"], 14).iloc[39]
            v_prefix = indicators.rsi(prefix["close"], 14).iloc[39]
        elif col == "atr":
            v_full = indicators.atr(full["high"], full["low"], full["close"], 14).iloc[39]
            v_prefix = indicators.atr(prefix["high"], prefix["low"], prefix["close"], 14).iloc[39]
        else:
            v_full = indicators.compute(full)[col].iloc[39]
            v_prefix = indicators.compute(prefix)[col].iloc[39]
        assert v_full == v_prefix or (np.isnan(v_full) and np.isnan(v_prefix))


# -- 6.2 structure ---------------------------------------------------------
def test_find_swings() -> None:
    closes = [100, 101, 105, 101, 100, 99, 95, 99, 100]  # peak at idx2, trough idx6
    df = _df(closes, highs=[c + 0.5 for c in closes], lows=[c - 0.5 for c in closes])
    swings = find_swings(df, k=2)
    kinds = {s.kind for s in swings}
    assert "high" in kinds and "low" in kinds


def test_detect_box() -> None:
    closes = [100 if i % 2 == 0 else 110 for i in range(60)]
    df = _df(closes, highs=[c + 0.2 for c in closes], lows=[c - 0.2 for c in closes])
    box = detect_box(df)
    assert box is not None
    assert box.lower < box.upper and box.upper - box.lower < 20


def test_trendline_rising_support() -> None:
    # Clear fractal V-shaped lows at rising floors -> support slope > 0.
    closes = []
    for seg in range(5):
        floor = 100 + seg * 2
        closes += [floor + 3, floor + 1, floor, floor + 1, floor + 3]
    df = _df(closes, highs=[c + 0.5 for c in closes], lows=[c - 0.5 for c in closes])
    swing_lows = [s for s in find_swings(df, k=2) if s.kind == "low"]
    assert len(swing_lows) >= 2
    lines = fit_trendlines(df)
    support = [l for l in lines if l.kind == "support"]
    assert support and support[0].slope > 0


# -- 6.3 SMC ---------------------------------------------------------------
def test_order_block_bullish() -> None:
    # idx0 down candle, idx1 closes above idx0 high
    df = _df(
        closes=[100.0, 115.0, 116.0],
        opens=[110.0, 101.0, 115.0],
        highs=[111.0, 117.0, 117.0],
        lows=[99.0, 100.0, 114.0],
    )
    ob = order_blocks(df)
    assert ob["bullish"] is not None
    assert ob["bullish"].lower == 99.0 and ob["bullish"].upper == 111.0


def test_bos_up() -> None:
    # Ascending fractal peaks -> higher highs -> BOS/CHOCH up events.
    closes = []
    for seg in range(5):
        peak = 100 + seg * 2
        closes += [peak - 3, peak - 1, peak, peak - 1, peak - 3]
    df = _df(closes, highs=[c + 0.5 for c in closes], lows=[c - 0.5 for c in closes])
    events = bos_choch(df)
    assert any(e.direction == "up" for e in events)


# -- 6.4 levels ------------------------------------------------------------
def test_levels_sorted_and_classified() -> None:
    closes = [100 + 10 * np.sin(i / 5) for i in range(120)]
    df = _df(closes, highs=[c + 1 for c in closes], lows=[c - 1 for c in closes])
    lv = levels.build_levels(df, top_n=10)
    assert lv, "should produce candidates"
    strengths = [x.strength for x in lv]
    assert strengths == sorted(strengths, reverse=True)  # sorted desc
    assert all(x.kind in ("support", "resistance") for x in lv)


def test_no_box_on_trend() -> None:
    # Strong single-direction trend -> width exceeds threshold -> no box.
    closes = list(range(100, 200))
    df = _df(closes, highs=[c + 0.5 for c in closes], lows=[c - 0.5 for c in closes])
    assert detect_box(df) is None


def test_liquidity_levels_sides_and_equal() -> None:
    # Two equal swing highs (110) + swing lows -> both sides + an equal cluster.
    closes = [
        105, 103, 100, 103, 105,   # low 100
        107, 109, 110, 109, 107,   # high 110
        105, 103, 102, 103, 105,   # low 102
        107, 109, 110, 109, 107,   # high 110 (equal)
    ]
    df = _df(closes, highs=[c + 0.5 for c in closes], lows=[c - 0.5 for c in closes])
    liq = liquidity_levels(df, tol=0.001)
    sides = {l.side for l in liq}
    assert "high" in sides and "low" in sides
    assert any(l.equal and l.side == "high" for l in liq), "equal highs should be flagged"


def test_choch_on_reversal() -> None:
    # Rising highs establish up-trend, then a lower low breaks structure -> CHOCH.
    closes = [
        107, 109, 110, 109, 107,   # high 110
        109, 111, 112, 111, 109,   # higher high 112 -> up
        108, 106, 105, 106, 108,   # low 105
        103, 101, 100, 101, 103,   # lower low 100 -> CHOCH down
    ]
    df = _df(closes, highs=[c + 0.5 for c in closes], lows=[c - 0.5 for c in closes])
    events = bos_choch(df)
    assert any(e.type == "CHOCH" for e in events)


def _run_all() -> None:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("All analysis tests passed.")


if __name__ == "__main__":
    _run_all()
