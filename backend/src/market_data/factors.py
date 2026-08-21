"""Factor definitions for the DL quant engine.

Two ways to define a factor:
- ``preset``: a named entry in ``FACTOR_CATALOG`` instantiated with numeric
  params (e.g. ``{"fn": "rsi", "params": {"period": 14}}``).
- ``expr``: a whitelisted expression over OHLCV/indicator columns evaluated by
  a restricted AST visitor (e.g. ``"log(close / sma(close, 20))"``). Anything
  outside the whitelist is rejected with ``ValueError`` and never executed.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd

from market_data import indicators

# -- factor definition -------------------------------------------------------


@dataclass(frozen=True)
class FactorDef:
    id: str
    name: str = ""
    kind: str = "preset"  # "preset" | "expr"
    fn: str = ""  # preset: catalog id; expr: ignored
    params: dict = field(default_factory=dict)
    expr: str = ""  # kind == "expr"
    enabled: bool = True

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "fn": self.fn,
            "params": dict(self.params),
            "expr": self.expr,
            "enabled": self.enabled,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "FactorDef":
        return cls(
            id=str(d.get("id", "")),
            name=str(d.get("name", d.get("id", ""))),
            kind=str(d.get("kind", "preset")),
            fn=str(d.get("fn", "")),
            params=dict(d.get("params") or {}),
            expr=str(d.get("expr", "")),
            enabled=bool(d.get("enabled", True)),
        )


# -- preset catalog ----------------------------------------------------------
# Each preset fn signature: fn(frame, params, computed) -> pd.Series
#   frame   : OHLCV + indicator columns (see indicators.compute)
#   params  : numeric params merged over default_params
#   computed: dict of already-computed feature series (id -> Series) so later
#             factors can depend on earlier ones (e.g. roll_mean on log_ret).


def _log_ret(frame: pd.DataFrame, params: dict, computed: dict) -> pd.Series:
    close = frame["close"]
    return np.log(close / close.shift(1))


def _macd_hist(frame: pd.DataFrame, params: dict, computed: dict) -> pd.Series:
    return frame["macd_hist"]


def _kdj_j(frame: pd.DataFrame, params: dict, computed: dict) -> pd.Series:
    return frame["kdj_j"]


def _boll_pos(frame: pd.DataFrame, params: dict, computed: dict) -> pd.Series:
    width = (frame["boll_upper"] - frame["boll_lower"]).replace(0, np.nan)
    return (frame["close"] - frame["boll_mid"]) / width


def _vegas_dist(frame: pd.DataFrame, params: dict, computed: dict) -> pd.Series:
    return (frame["close"] - frame["vegas_ema144"]) / frame["close"]


def _roll_mean(frame: pd.DataFrame, params: dict, computed: dict) -> pd.Series:
    src = computed[params.get("source", "log_ret")]
    return src.rolling(int(params.get("n", 5))).mean()


def _roll_std(frame: pd.DataFrame, params: dict, computed: dict) -> pd.Series:
    src = computed[params.get("source", "log_ret")]
    return src.rolling(int(params.get("n", 5))).std()


def _rsi(frame: pd.DataFrame, params: dict, computed: dict) -> pd.Series:
    return indicators.rsi(frame["close"], int(params.get("period", 14)))


def _atr(frame: pd.DataFrame, params: dict, computed: dict) -> pd.Series:
    return indicators.atr(frame["high"], frame["low"], frame["close"], int(params.get("period", 14)))


def _vol_ratio(frame: pd.DataFrame, params: dict, computed: dict) -> pd.Series:
    return indicators.vol_ratio(frame["volume"], int(params.get("n", 20)))


def _mom(frame: pd.DataFrame, params: dict, computed: dict) -> pd.Series:
    return indicators.mom(frame["close"], int(params.get("n", 10)))


FACTOR_CATALOG: dict[str, dict] = {
    "log_ret": {"name": "对数收益", "fn": _log_ret, "default_params": {}},
    "macd_hist": {"name": "MACD 柱", "fn": _macd_hist, "default_params": {}},
    "kdj_j": {"name": "KDJ-J", "fn": _kdj_j, "default_params": {}},
    "boll_pos": {"name": "布林带位置", "fn": _boll_pos, "default_params": {}},
    "vegas_dist": {"name": "VEGAS 距离", "fn": _vegas_dist, "default_params": {}},
    "roll_mean": {"name": "滚动均值", "fn": _roll_mean, "default_params": {"source": "log_ret", "n": 5}},
    "roll_std": {"name": "滚动标准差", "fn": _roll_std, "default_params": {"source": "log_ret", "n": 5}},
    "rsi": {"name": "RSI", "fn": _rsi, "default_params": {"period": 14}},
    "atr": {"name": "ATR", "fn": _atr, "default_params": {"period": 14}},
    "vol_ratio": {"name": "成交量比", "fn": _vol_ratio, "default_params": {"n": 20}},
    "mom": {"name": "动量", "fn": _mom, "default_params": {"n": 10}},
}

# The exact 7 features the engine shipped with. Kept as preset definitions so
# ``build_features(df, None)`` produces byte-identical output to before.
DEFAULT_FACTORS: list[FactorDef] = [
    FactorDef(id="log_ret", name="对数收益", fn="log_ret"),
    FactorDef(id="macd_hist", name="MACD 柱", fn="macd_hist"),
    FactorDef(id="kdj_j", name="KDJ-J", fn="kdj_j"),
    FactorDef(id="boll_pos", name="布林带位置", fn="boll_pos"),
    FactorDef(id="vegas_dist", name="VEGAS 距离", fn="vegas_dist"),
    FactorDef(id="roll_mean_5", name="收益5均", fn="roll_mean", params={"source": "log_ret", "n": 5}),
    FactorDef(id="roll_std_5", name="收益5波动", fn="roll_std", params={"source": "log_ret", "n": 5}),
]

FEATURE_COLUMNS = [f.id for f in DEFAULT_FACTORS]


# -- whitelist expression DSL ------------------------------------------------
_EXPR_FUNC_NAMES = {
    "sma", "ema", "std", "pct", "rsi", "max", "min", "shift",
    "log", "abs", "atr", "vol_ratio",
}

_ALLOWED_BINOPS = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod)
_ALLOWED_UNARYOPS = (ast.UAdd, ast.USub)


class _WhitelistValidator(ast.NodeVisitor):
    """Rejects anything outside numbers / columns / whitelisted functions."""

    def __init__(self, allowed_names: set[str]) -> None:
        self.allowed_names = allowed_names

    def visit_Expression(self, node: ast.Expression) -> None:  # noqa: N802
        self.visit(node.body)

    def visit_Constant(self, node: ast.Constant) -> None:  # noqa: N802
        if not isinstance(node.value, (int, float)):
            raise ValueError("strings/literals are not allowed in factor expressions")

    def visit_Name(self, node: ast.Name) -> None:  # noqa: N802
        if node.id not in self.allowed_names:
            raise ValueError(f"unknown name in expression: {node.id!r}")

    def visit_BinOp(self, node: ast.BinOp) -> None:  # noqa: N802
        if not isinstance(node.op, _ALLOWED_BINOPS):
            raise ValueError(f"operator not allowed: {type(node.op).__name__}")
        self.visit(node.left)
        self.visit(node.right)

    def visit_UnaryOp(self, node: ast.UnaryOp) -> None:  # noqa: N802
        if not isinstance(node.op, _ALLOWED_UNARYOPS):
            raise ValueError(f"operator not allowed: {type(node.op).__name__}")
        self.visit(node.operand)

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        if not isinstance(node.func, ast.Name) or node.func.id not in _EXPR_FUNC_NAMES:
            raise ValueError("only whitelisted functions are allowed in expressions")
        if node.keywords:
            raise ValueError("keyword arguments are not allowed in expressions")
        for arg in node.args:
            self.visit(arg)

    def visit_Attribute(self, node: ast.Attribute) -> None:  # noqa: N802
        raise ValueError("attribute access is not allowed in factor expressions")

    def visit_Subscript(self, node: ast.Subscript) -> None:  # noqa: N802
        raise ValueError("subscripting is not allowed in factor expressions")

    def generic_visit(self, node: ast.AST) -> None:
        raise ValueError(f"unsupported syntax in factor expression: {type(node).__name__}")


def _w_sma(x: pd.Series, n: int) -> pd.Series:
    return x.rolling(int(n)).mean()


def _w_ema(x: pd.Series, n: int) -> pd.Series:
    return x.ewm(span=int(n), adjust=False).mean()


def _w_std(x: pd.Series, n: int) -> pd.Series:
    return x.rolling(int(n)).std()


def _w_pct(x: pd.Series, n: int) -> pd.Series:
    return x.pct_change(int(n))


def _w_rsi(x: pd.Series, n: int) -> pd.Series:
    return indicators.rsi(x, int(n))


def _w_max(x: pd.Series, n: int) -> pd.Series:
    return x.rolling(int(n)).max()


def _w_min(x: pd.Series, n: int) -> pd.Series:
    return x.rolling(int(n)).min()


def _w_shift(x: pd.Series, n: int) -> pd.Series:
    return x.shift(int(n))


def _w_log(x: pd.Series) -> pd.Series:
    return np.log(x)


def _w_abs(x: pd.Series) -> pd.Series:
    return np.abs(x)


def _w_atr(h: pd.Series, low: pd.Series, c: pd.Series, n: int) -> pd.Series:
    return indicators.atr(h, low, c, int(n))


def _w_vol_ratio(v: pd.Series, n: int) -> pd.Series:
    return indicators.vol_ratio(v, int(n))


_EXPR_FUNCS: dict[str, Callable[..., pd.Series]] = {
    "sma": _w_sma,
    "ema": _w_ema,
    "std": _w_std,
    "pct": _w_pct,
    "rsi": _w_rsi,
    "max": _w_max,
    "min": _w_min,
    "shift": _w_shift,
    "log": _w_log,
    "abs": _w_abs,
    "atr": _w_atr,
    "vol_ratio": _w_vol_ratio,
}

_INJECTION_PATTERNS = ("__", "import", "lambda", ";", "=", ":", "[", "]")


def evaluate_expr(expr: str, frame: pd.DataFrame) -> pd.Series:
    """Evaluate a whitelisted factor expression. Raises ValueError on rejection."""
    for bad in _INJECTION_PATTERNS:
        if bad in expr:
            raise ValueError(f"expression contains forbidden token {bad!r}")
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError as exc:
        raise ValueError(f"invalid factor expression: {exc}") from exc
    allowed = set(frame.columns) | _EXPR_FUNC_NAMES
    _WhitelistValidator(allowed).visit(tree)
    env: dict = {col: frame[col] for col in frame.columns}
    env.update(_EXPR_FUNCS)
    try:
        result = eval(compile(tree, "<factor>", "eval"), {"__builtins__": {}}, env)  # noqa: S307
    except Exception as exc:  # noqa: BLE001 - surface as factor error
        raise ValueError(f"factor expression failed: {exc}") from exc
    out = pd.Series(result, index=frame.index)
    return out


# -- resolution / computation ------------------------------------------------
def resolve_factors(factor_defs: list | None) -> list[FactorDef]:
    """Normalize a factor config to an ordered, enabled-only FactorDef list."""
    if factor_defs is None:
        return list(DEFAULT_FACTORS)
    defs = [f if isinstance(f, FactorDef) else FactorDef.from_dict(f) for f in factor_defs]
    return [d for d in defs if d.enabled]


def compute_factors(df: pd.DataFrame, factor_defs: list | None = None) -> pd.DataFrame:
    """Return a DataFrame with one column per enabled factor (config order).

    ``factor_defs=None`` → the default 7 factors, byte-identical to the
    pre-configuration engine.
    """
    frame = indicators.compute(df)
    defs = resolve_factors(factor_defs)
    computed: dict[str, pd.Series] = {}
    columns: list[str] = []
    for fd in defs:
        series = _compute_one(fd, frame, computed)
        series = pd.Series(series, index=frame.index)
        computed[fd.id] = series
        columns.append(fd.id)
    return pd.DataFrame(computed, index=frame.index)[columns]


def _compute_one(fd: FactorDef, frame: pd.DataFrame, computed: dict) -> pd.Series:
    if fd.kind == "expr":
        if not fd.expr.strip():
            raise ValueError(f"factor {fd.id}: empty expression")
        return evaluate_expr(fd.expr, frame)
    entry = FACTOR_CATALOG.get(fd.fn)
    if entry is None:
        raise ValueError(f"factor {fd.id}: unknown preset fn {fd.fn!r}")
    params = {**entry["default_params"], **fd.params}
    return entry["fn"](frame, params, computed)
