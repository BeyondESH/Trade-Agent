import { describe, expect, it, vi } from "vitest";
import { ChartSyncBus, DEFAULT_SYNC_FLAGS } from "./chartSyncBus";

describe("ChartSyncBus", () => {
  it("delivers events to all cells except the origin", () => {
    const bus = new ChartSyncBus();
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    bus.register(0, a);
    bus.register(1, b);
    bus.register(2, c);
    bus.emit("symbol", 1, { symbol: { ticker: "ETHUSDT", shortName: "ETHUSDT" } });
    expect(a).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(a.mock.calls[0][0]).toMatchObject({ kind: "symbol", origin: 1 });
  });

  it("unregister removes only the exact listener", () => {
    const bus = new ChartSyncBus();
    const a = vi.fn();
    const off = bus.register(0, a);
    off();
    bus.emit("period", 1, { period: { multiplier: 5, timespan: "minute", text: "5m" } });
    expect(a).not.toHaveBeenCalled();
  });

  it("per-kind switches gate emission (anti-config drift)", () => {
    const bus = new ChartSyncBus();
    const a = vi.fn();
    bus.register(0, a);
    bus.setFlags({ ...DEFAULT_SYNC_FLAGS, period: false });
    bus.emit("period", 1, { period: { multiplier: 1, timespan: "hour", text: "1H" } });
    expect(a).not.toHaveBeenCalled();
    bus.emit("symbol", 1, { symbol: { ticker: "BTCUSDT", shortName: "BTCUSDT" } });
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("a listener throwing does not break delivery to others (anti-echo robustness)", () => {
    const bus = new ChartSyncBus();
    bus.register(1, () => {
      throw new Error("boom");
    });
    const c = vi.fn();
    bus.register(2, c);
    bus.register(0, () => {});
    expect(() => bus.emit("range", 0, { fromTs: 1, toTs: 2 })).not.toThrow();
    expect(c).toHaveBeenCalledTimes(1);
  });

  it("getFlags returns a copy", () => {
    const bus = new ChartSyncBus();
    const f = bus.getFlags();
    f.symbol = false;
    expect(bus.isEnabled("symbol")).toBe(true);
  });
});
