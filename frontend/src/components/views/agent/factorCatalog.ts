import type { FactorDef } from "../../../api/types";

export interface PresetDef {
  fn: string;
  name: string;
  defaultParams: Record<string, number | string>;
}

/** Preset factor catalog (mirrors backend FACTOR_CATALOG ids). */
export const FACTOR_CATALOG: PresetDef[] = [
  { fn: "rsi", name: "RSI", defaultParams: { period: 14 } },
  { fn: "atr", name: "ATR", defaultParams: { period: 14 } },
  { fn: "vol_ratio", name: "成交量比", defaultParams: { n: 20 } },
  { fn: "mom", name: "动量", defaultParams: { n: 10 } },
  { fn: "roll_mean", name: "滚动均值", defaultParams: { source: "log_ret", n: 5 } },
  { fn: "roll_std", name: "滚动标准差", defaultParams: { source: "log_ret", n: 5 } },
];

/** The engine's default 7-factor set (used when config has no factors). */
export const DEFAULT_FACTORS: FactorDef[] = [
  { id: "log_ret", name: "对数收益", kind: "preset", fn: "log_ret", params: {} },
  { id: "macd_hist", name: "MACD 柱", kind: "preset", fn: "macd_hist", params: {} },
  { id: "kdj_j", name: "KDJ-J", kind: "preset", fn: "kdj_j", params: {} },
  { id: "boll_pos", name: "布林带位置", kind: "preset", fn: "boll_pos", params: {} },
  { id: "vegas_dist", name: "VEGAS 距离", kind: "preset", fn: "vegas_dist", params: {} },
  {
    id: "roll_mean_5",
    name: "收益5均",
    kind: "preset",
    fn: "roll_mean",
    params: { source: "log_ret", n: 5 },
  },
  {
    id: "roll_std_5",
    name: "收益5波动",
    kind: "preset",
    fn: "roll_std",
    params: { source: "log_ret", n: 5 },
  },
];

/** Fallback when the persisted factor config is missing/empty. */
export function resolveFactors(factors: FactorDef[] | null | undefined): FactorDef[] {
  if (factors && factors.length > 0) return factors;
  return DEFAULT_FACTORS;
}

export function enabledFactors(factors: FactorDef[]): FactorDef[] {
  return factors.filter((f) => f.enabled !== false);
}

export function newId(prefix: string, factors: FactorDef[]): string {
  let n = factors.length + 1;
  let id = `${prefix}_${n}`;
  while (factors.some((f) => f.id === id)) {
    n += 1;
    id = `${prefix}_${n}`;
  }
  return id;
}
