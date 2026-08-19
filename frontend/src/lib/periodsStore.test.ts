// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_PINNED_TIMEFRAMES,
  hasPinnedRecord,
  loadPinnedTimeframes,
  savePinnedTimeframes,
  subscribePinnedTimeframes,
  togglePinnedTimeframe,
} from "./periodsStore";

beforeEach(() => {
  localStorage.clear();
});

describe("periodsStore", () => {
  it("returns defaults when there is no stored record", () => {
    expect(hasPinnedRecord()).toBe(false);
    expect(loadPinnedTimeframes()).toEqual(DEFAULT_PINNED_TIMEFRAMES);
  });

  it("defaults are 1m 15m 1H 6H 1D 1W 1M", () => {
    expect(DEFAULT_PINNED_TIMEFRAMES).toEqual(["1m", "15m", "1h", "6h", "1d", "1w", "1mo"]);
  });

  it("persists an explicit pinned list and reloads it", () => {
    savePinnedTimeframes(["1s", "5m"]);
    expect(hasPinnedRecord()).toBe(true);
    expect(loadPinnedTimeframes()).toEqual(["1s", "5m"]);
  });

  it("distinguishes an explicit empty list from no record", () => {
    expect(hasPinnedRecord()).toBe(false);
    savePinnedTimeframes([]);
    expect(hasPinnedRecord()).toBe(true);
    expect(loadPinnedTimeframes()).toEqual([]);
  });

  it("falls back to defaults on corrupted storage", () => {
    localStorage.setItem("raibro.pinnedTimeframes", "{oops");
    expect(loadPinnedTimeframes()).toEqual(DEFAULT_PINNED_TIMEFRAMES);
  });

  it("falls back to defaults on non-array storage", () => {
    localStorage.setItem("raibro.pinnedTimeframes", JSON.stringify({ a: 1 }));
    expect(loadPinnedTimeframes()).toEqual(DEFAULT_PINNED_TIMEFRAMES);
  });

  it("drops non-string entries from a stored list", () => {
    localStorage.setItem("raibro.pinnedTimeframes", JSON.stringify(["1m", 42, null]));
    expect(loadPinnedTimeframes()).toEqual(["1m"]);
  });

  it("toggle adds and removes a timeframe, notifying subscribers", () => {
    const seen: string[][] = [];
    const unsub = subscribePinnedTimeframes((tfs) => seen.push(tfs));
    const afterAdd = togglePinnedTimeframe("3m", ["1m"]);
    expect(afterAdd).toEqual(["1m", "3m"]);
    const afterRemove = togglePinnedTimeframe("1m", afterAdd);
    expect(afterRemove).toEqual(["3m"]);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(loadPinnedTimeframes()).toEqual(["3m"]);
    unsub();
  });
});
