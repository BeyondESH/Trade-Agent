import { describe, expect, it, vi } from "vitest";
import { ReplayEngine } from "./replayEngine";
import type { Candle } from "../api/types";

function bars(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    open_time: 1000 + i * 1000,
    open: 1,
    high: 2,
    low: 0,
    close: 1 + i * 0.1,
    volume: 1,
  }));
}

describe("ReplayEngine", () => {
  it("enters replay paused at the requested cursor", () => {
    const e = new ReplayEngine();
    e.load(bars(10), 4);
    const s = e.snapshot;
    expect(s.active).toBe(true);
    expect(s.playing).toBe(false);
    expect(s.cursor).toBe(4);
    expect(s.total).toBe(10);
    expect(s.timestamp).toBe(1000 + 4 * 1000);
  });

  it("slice returns data up to the cursor only", () => {
    const e = new ReplayEngine();
    e.load(bars(10), 3);
    expect(e.slice()).toHaveLength(4);
    expect(e.slice()[3].open_time).toBe(1000 + 3 * 1000);
  });

  it("steps forward and auto-pauses at the end", () => {
    const e = new ReplayEngine();
    e.load(bars(4), 1);
    expect(e.snapshot.cursor).toBe(1);
    expect(e.step()).toBe(true);
    expect(e.snapshot.cursor).toBe(2);
    expect(e.step()).toBe(true);
    expect(e.snapshot.cursor).toBe(3);
    expect(e.step()).toBe(false); // reached the end
    expect(e.snapshot.cursor).toBe(3);
    expect(e.snapshot.playing).toBe(false);
  });

  it("plays on an interval honoring the speed, and pauses", () => {
    vi.useFakeTimers();
    const e = new ReplayEngine();
    e.load(bars(20), 0);
    e.setSpeed(3);
    e.play();
    expect(e.snapshot.playing).toBe(true);
    vi.advanceTimersByTime(1200); // ~7 ticks at 500/3 ms
    expect(e.snapshot.cursor).toBeGreaterThan(2);
    e.pause();
    const frozen = e.snapshot.cursor;
    vi.advanceTimersByTime(2000);
    expect(e.snapshot.cursor).toBe(frozen);
    expect(e.snapshot.playing).toBe(false);
    vi.useRealTimers();
  });

  it("seek clamps within bounds and notifies", () => {
    const e = new ReplayEngine();
    e.load(bars(10), 2);
    const spy = vi.fn();
    e.subscribe(spy);
    e.seek(99);
    expect(e.snapshot.cursor).toBe(9);
    e.seek(-5);
    expect(e.snapshot.cursor).toBe(1);
    expect(spy).toHaveBeenCalled();
  });

  it("exit clears state and notifies", () => {
    const e = new ReplayEngine();
    e.load(bars(5), 2);
    const spy = vi.fn();
    e.subscribe(spy);
    e.exit();
    expect(e.snapshot.active).toBe(false);
    expect(e.slice()).toHaveLength(0);
    expect(spy).toHaveBeenCalled();
  });
});
