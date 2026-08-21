import { describe, expect, it } from "vitest";
import {
  equityVsBenchmark,
  monthlyHeatmap,
  monthlyReturns,
  probaHistogram,
  probaThresholdData,
  returnsHistogram,
  tradePnl,
} from "./chartData";
import type { BacktestTrade } from "../api/types";

const mkTrade = (netReturn: number): BacktestTrade => ({
  side: "long",
  entry_time: 1,
  entry_price: 100,
  exit_time: 2,
  exit_price: 101,
  bars: 1,
  gross_return: 0.01,
  net_return: netReturn,
});

describe("monthlyReturns", () => {
  it("returns [] for short or misaligned inputs", () => {
    expect(monthlyReturns([], [])).toEqual([]);
    expect(monthlyReturns([1.0], [1])).toEqual([]);
    expect(monthlyReturns([1.0, 1.1], [1])).toEqual([]);
  });

  it("aggregates a single month from first to last bar", () => {
    const t = new Date(2024, 5, 15).getTime();
    const out = monthlyReturns([1.0, 1.1, 1.21], [t, t + 3_600_000, t + 7_200_000]);
    expect(out).toHaveLength(1);
    expect(out[0].month).toBe("2024-06");
    expect(out[0].value).toBeCloseTo(0.21, 6);
  });

  it("computes month-over-month returns across year boundary", () => {
    const nov = new Date(2023, 10, 30).getTime();
    const dec = new Date(2023, 11, 31).getTime();
    const jan = new Date(2024, 0, 31).getTime();
    const out = monthlyReturns(
      [1.0, 1.05, 1.1, 1.32],
      [nov, nov + 3_600_000, dec, jan],
    );
    expect(out.map((m) => m.month)).toEqual(["2023-11", "2023-12", "2024-01"]);
    expect(out[0].value).toBeCloseTo(0.05, 6);      // 1.05/1.0 - 1
    expect(out[1].value).toBeCloseTo(1.1 / 1.05 - 1, 6);
    expect(out[2].value).toBeCloseTo(1.32 / 1.1 - 1, 6);
  });
});

describe("tradePnl", () => {
  it("maps net_return to pnl points with 1-based ids", () => {
    const out = tradePnl([mkTrade(0.05), mkTrade(-0.02)]);
    expect(out).toEqual([
      { id: 1, pnl: 0.05 },
      { id: 2, pnl: -0.02 },
    ]);
  });

  it("returns [] for empty list", () => {
    expect(tradePnl([])).toEqual([]);
  });
});

describe("returnsHistogram", () => {
  it("returns [] for short series", () => {
    expect(returnsHistogram([])).toEqual([]);
    expect(returnsHistogram([1.0])).toEqual([]);
  });

  it("collapses to one bin when all returns are equal", () => {
    const out = returnsHistogram([1, 2, 4, 8], 10);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(3);
  });

  it("bins per-bar returns and counts sum to bars - 1", () => {
    const out = returnsHistogram([1, 1.1, 0.9, 1.2, 1.0, 1.15], 10);
    expect(out).toHaveLength(10);
    const total = out.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(5);
    // labels ascending
    const labels = out.map((b) => Number.parseFloat(b.label));
    for (let i = 1; i < labels.length; i++) expect(labels[i]).toBeGreaterThanOrEqual(labels[i - 1]);
  });

  it("skips non-finite returns", () => {
    const out = returnsHistogram([1, Number.NaN, 1.5, 2.0, 2.6], 10);
    const total = out.reduce((s, b) => s + b.count, 0);
    // NaN bar skipped: valid diffs are 1.5/NaN? no — diff 3->4 and 4->5 only.
    expect(total).toBe(2);
  });
});

describe("probaHistogram", () => {
  it("returns [] for empty or all-invalid input", () => {
    expect(probaHistogram([])).toEqual([]);
    expect(probaHistogram([Number.NaN, Number.NaN])).toEqual([]);
  });

  it("bins probabilities into [0,1] ranges", () => {
    const out = probaHistogram([0.1, 0.25, 0.55, 0.9, 0.05], 10);
    expect(out).toHaveLength(10);
    const total = out.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(5);
  });

  it("clamps values outside [0,1]", () => {
    const out = probaHistogram([-0.5, 1.5, 0.5], 10);
    const total = out.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(3);
  });
});

describe("equityVsBenchmark", () => {
  it("zips equity with benchmark, null when lane is missing", () => {
    expect(equityVsBenchmark([1, 1.1], [1, 1.2])).toEqual([
      { i: 0, equity: 1, benchmark: 1 },
      { i: 1, equity: 1.1, benchmark: 1.2 },
    ]);
    expect(equityVsBenchmark([1, 1.1], [1])).toEqual([
      { i: 0, equity: 1, benchmark: 1 },
      { i: 1, equity: 1.1, benchmark: null },
    ]);
    expect(equityVsBenchmark([1, 1.1])).toEqual([
      { i: 0, equity: 1, benchmark: null },
      { i: 1, equity: 1.1, benchmark: null },
    ]);
  });
});

describe("probaThresholdData", () => {
  it("annotates proba with ordered upper/lower thresholds", () => {
    const out = probaThresholdData([0.6, 0.4], 0.55);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ i: 0, proba: 0.6, upper: 0.55, lower: 0.45 });
    expect(out[1].upper).toBe(0.55);
  });
});

describe("monthlyHeatmap", () => {
  it("groups monthly returns into year x month cells", () => {
    const monthly = [
      { month: "2023-11", value: 0.05 },
      { month: "2023-12", value: 0.02 },
      { month: "2024-01", value: -0.03 },
    ];
    const out = monthlyHeatmap(monthly);
    expect(out.years).toEqual([2023, 2024]);
    expect(out.cells).toEqual([
      { year: 2023, month: 11, value: 0.05 },
      { year: 2023, month: 12, value: 0.02 },
      { year: 2024, month: 1, value: -0.03 },
    ]);
  });

  it("handles empty input", () => {
    expect(monthlyHeatmap([])).toEqual({ years: [], cells: [] });
  });
});
