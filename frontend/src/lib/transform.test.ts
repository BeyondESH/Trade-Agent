import { describe, expect, it } from "vitest";
import type { Box, Candle, Level, Trendline } from "../api/types";
import {
  boxToRect,
  candleToKLine,
  candlesToKLineData,
  levelsToPriceLines,
  priceLineToOverlay,
  trendlineToSegment,
} from "./transform";

describe("candlesToKLineData", () => {
  it("keeps ms timestamps and sorts ascending", () => {
    const candles: Candle[] = [
      { open_time: 2000, open: 2, high: 3, low: 1, close: 2, volume: 1 },
      { open_time: 1000, open: 1, high: 2, low: 0, close: 1, volume: 1 },
    ];
    const s = candlesToKLineData(candles);
    expect(s.map((p) => p.timestamp)).toEqual([1000, 2000]);
    expect(s[0].close).toBe(1);
    expect(s[0]).toHaveProperty("volume");
  });
});

describe("candleToKLine", () => {
  it("maps a single API candle to klinecharts KLineData (ms)", () => {
    const k = candleToKLine({ open_time: 5000, open: 1, high: 2, low: 0, close: 1, volume: 9 });
    expect(k).toEqual({ timestamp: 5000, open: 1, high: 2, low: 0, close: 1, volume: 9 });
  });
});

describe("levelsToPriceLines", () => {
  it("maps kind to color", () => {
    const levels: Level[] = [
      { price: 100, kind: "support", strength: 5, sources: ["swing"] },
      { price: 110, kind: "resistance", strength: 3, sources: ["fib"] },
    ];
    const lines = levelsToPriceLines(levels);
    expect(lines[0].color).toBe("#089981");
    expect(lines[1].color).toBe("#f23645");
    expect(lines[0].title).toContain("support");
  });
});

describe("priceLineToOverlay", () => {
  it("builds a klinecharts priceLine overlay", () => {
    const o = priceLineToOverlay({ price: 100, kind: "support", color: "#26a69a", title: "s" });
    expect(o.name).toBe("priceLine");
    expect(o.points).toEqual([{ value: 100 }]);
    expect(o.styles?.line?.color).toBe("#26a69a");
  });

  it("carries the alertId in extendData when provided", () => {
    const o = priceLineToOverlay({ price: 100, color: "#ff9800", alertId: "alt-1" });
    expect(o.extendData).toMatchObject({ alertId: "alt-1", title: undefined });
  });

  it("omits alertId from extendData when absent", () => {
    const o = priceLineToOverlay({ price: 100, color: "#ff9800" });
    expect(o.extendData).not.toHaveProperty("alertId");
  });
});

describe("trendlineToSegment", () => {
  it("projects slope/intercept at both endpoints (ms)", () => {
    const line: Trendline = { kind: "support", slope: 2, intercept: 10, projection: 0 };
    const seg = trendlineToSegment(line, 1000, 2000);
    expect(seg.name).toBe("segment");
    expect(seg.points?.[0]?.value).toBe(2 * 1000 + 10);
    expect(seg.points?.[1]?.value).toBe(2 * 2000 + 10);
    expect(seg.points?.[0]?.timestamp).toBe(1000);
  });
});

describe("boxToRect", () => {
  it("builds a rect spanning lower/upper within the time window", () => {
    const box: Box = { lower: 99, upper: 110 };
    const r = boxToRect(box, 1000, 2000);
    expect(r.name).toBe("rect");
    expect(r.points?.[0]).toMatchObject({ timestamp: 1000, value: 99 });
    expect(r.points?.[1]).toMatchObject({ timestamp: 2000, value: 110 });
  });
});
