import { describe, expect, it } from "vitest";
import type { Period } from "@klinecharts/pro";

/**
 * Mirror of klinecharts-pro's N1 window computation (see vendor dist) used as a
 * regression guard for period-boundary alignment. The vendor computes [from, to]
 * where `to` is aligned to the *period boundary* (multiplier-aware) so the
 * requested history window lines up with real candle timestamps.
 */
function n1(period: Period, f: number, v: number): [number, number] {
  let to = f;
  let from = to;
  const step = period.multiplier;
  switch (period.timespan) {
    case "minute": {
      to = to - (to % (step * 60 * 1e3));
      from = to - v * step * 60 * 1e3;
      break;
    }
    case "hour": {
      to = to - (to % (step * 60 * 60 * 1e3));
      from = to - v * step * 60 * 60 * 1e3;
      break;
    }
    case "day": {
      to = to - (to % (step * 24 * 60 * 60 * 1e3));
      from = to - v * step * 24 * 60 * 60 * 1e3;
      break;
    }
    default:
      break;
  }
  return [from, to];
}

const HOUR_MS = 60 * 60 * 1e3;
const MINUTE_MS = 60 * 1e3;
const DAY_MS = 24 * HOUR_MS;

describe("period window boundary alignment (klinecharts-pro N1)", () => {
  it("5m aligns `to` to a 5-minute boundary", () => {
    const now = Date.UTC(2026, 7, 18, 5, 33, 0); // 05:33:00
    const [, to] = n1({ multiplier: 5, timespan: "minute", text: "5m" }, now, 500);
    expect(to % (5 * MINUTE_MS)).toBe(0);
  });

  it("4h aligns `to` to a 4-hour boundary (not an arbitrary hour)", () => {
    const now = Date.UTC(2026, 7, 18, 5, 30, 0); // 05:30 -> boundary 04:00
    const [, to] = n1({ multiplier: 4, timespan: "hour", text: "4h" }, now, 500);
    expect(to % (4 * HOUR_MS)).toBe(0);
    expect(to).toBe(Date.UTC(2026, 7, 18, 4, 0, 0));
  });

  it("12h aligns `to` to a 12-hour boundary", () => {
    const now = Date.UTC(2026, 7, 18, 13, 15, 0); // 13:15 -> boundary 12:00
    const [, to] = n1({ multiplier: 12, timespan: "hour", text: "12h" }, now, 500);
    expect(to % (12 * HOUR_MS)).toBe(0);
    expect(to).toBe(Date.UTC(2026, 7, 18, 12, 0, 0));
  });

  it("1d aligns `to` to a day boundary", () => {
    const now = Date.UTC(2026, 7, 18, 5, 30, 0);
    const [, to] = n1({ multiplier: 1, timespan: "day", text: "1d" }, now, 500);
    expect(to % DAY_MS).toBe(0);
  });

  it("`from` is exactly v periods before the aligned `to`", () => {
    const now = Date.UTC(2026, 7, 18, 5, 30, 0);
    const [from, to] = n1({ multiplier: 4, timespan: "hour", text: "4h" }, now, 500);
    expect(to - from).toBe(500 * 4 * HOUR_MS);
  });
});
