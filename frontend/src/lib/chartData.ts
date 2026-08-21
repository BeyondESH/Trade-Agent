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
