import type { BacktestTrade } from "../api/types";

export interface MonthlyReturn {
  month: string;
  value: number;
}

export interface TradePnlPoint {
  id: number;
  pnl: number;
}

export interface HistogramBin {
  label: string;
  count: number;
}

/** Histogram of model probabilities bucketed into `bins` ranges in [0,1].
 * Returns [] when proba is empty or has no finite values. */
export function probaHistogram(proba: number[], bins = 20): HistogramBin[] {
  const vals = proba.filter((p) => Number.isFinite(p));
  if (vals.length === 0) return [];
  const counts = new Array<number>(bins).fill(0);
  for (const p of vals) {
    const clamped = Math.max(0, Math.min(1, p));
    let b = Math.floor(clamped * bins);
    if (b >= bins) b = bins - 1;
    counts[b]++;
  }
  const width = 1 / bins;
  return counts.map((count, i) => ({
    label: `${(i * width).toFixed(2)}`,
    count,
  }));
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Group equity by calendar month; each month's return is (month-end equity /
 * previous month-end equity - 1). The first month is measured from the first
 * bar. Returns [] when inputs are too short or misaligned. */
export function monthlyReturns(equity: number[], openTime: number[]): MonthlyReturn[] {
  if (equity.length < 2 || equity.length !== openTime.length) return [];
  const monthEnd = new Map<string, number>();
  const order: string[] = [];
  for (let i = 0; i < openTime.length; i++) {
    const key = monthKey(openTime[i]);
    if (!monthEnd.has(key)) order.push(key);
    monthEnd.set(key, equity[i]);
  }
  return order.map((month, i) => {
    const end = monthEnd.get(month)!;
    const start = i === 0 ? equity[0] : monthEnd.get(order[i - 1])!;
    return { month, value: start > 0 ? end / start - 1 : 0 };
  });
}

/** Per-trade net PnL points for a bar chart (win = green, loss = red). */
export function tradePnl(tradeList: BacktestTrade[]): TradePnlPoint[] {
  return tradeList.map((t, i) => ({ id: i + 1, pnl: t.net_return }));
}

/** Histogram of per-bar equity returns bucketed into `bins` ranges. Skips
 * non-finite / non-positive-denominator bars; collapses to one bin when all
 * returns are equal. */
export function returnsHistogram(equity: number[], bins = 20): HistogramBin[] {
  if (equity.length < 2) return [];
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1];
    if (!Number.isFinite(prev) || prev <= 0) continue;
    const r = equity[i] / prev - 1;
    if (Number.isFinite(r)) rets.push(r);
  }
  if (rets.length === 0) return [];
  const min = Math.min(...rets);
  const max = Math.max(...rets);
  if (max === min) {
    return [{ label: `${(min * 100).toFixed(2)}%`, count: rets.length }];
  }
  const width = (max - min) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const r of rets) {
    let b = Math.floor((r - min) / width);
    if (b >= bins) b = bins - 1;
    counts[b]++;
  }
  return counts.map((count, i) => ({
    label: `${((min + i * width) * 100).toFixed(2)}%`,
    count,
  }));
}

/** Point for the equity-vs-benchmark chart; benchmark null when absent. */
export interface EquityBenchPoint {
  i: number;
  equity: number;
  benchmark: number | null;
}

/** Zip equity with the (optional) benchmark lane for charting. */
export function equityVsBenchmark(
  equity: number[],
  benchmark?: number[],
): EquityBenchPoint[] {
  const bench = benchmark ?? [];
  return equity.map((v, i) => ({ i, equity: v, benchmark: bench[i] ?? null }));
}

/** Point for the proba time series with threshold bands. */
export interface ProbaPoint {
  i: number;
  proba: number;
  upper: number;
  lower: number;
}

/** Annotate a proba lane with its long/short threshold lines. */
export function probaThresholdData(proba: number[], thresh: number): ProbaPoint[] {
  const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
  const upper = round6(Math.max(thresh, 1 - thresh));
  const lower = round6(Math.min(thresh, 1 - thresh));
  return proba.map((p, i) => ({ i, proba: p, upper, lower }));
}

export interface MonthCell {
  year: number;
  month: number;
  value: number;
}

/** Group monthly returns (from `monthlyReturns`) into a year x month grid. */
export function monthlyHeatmap(monthly: MonthlyReturn[]): {
  years: number[];
  cells: MonthCell[];
} {
  const years = [...new Set(monthly.map((m) => Number(m.month.slice(0, 4))))].sort();
  const cells = monthly.map((m) => {
    const [y, mo] = m.month.split("-").map(Number);
    return { year: y, month: mo, value: m.value };
  });
  return { years, cells };
}
