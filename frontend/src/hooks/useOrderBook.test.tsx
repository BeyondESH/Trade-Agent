// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WsFrame } from "./useExchangeSocket";
import { useOrderBook } from "./useOrderBook";

const listeners: Array<{ channel: string; symbol: string; fn: (f: WsFrame) => void }> = [];

vi.mock("./useExchangeSocket", () => ({
  useExchangeSocket: (channel: string, symbol: string, onFrame: (f: WsFrame) => void) => {
    listeners.push({ channel, symbol, fn: onFrame });
  },
}));

function emitFor(symbol: string, f: WsFrame): void {
  for (const l of listeners) {
    if (l.symbol === symbol) l.fn(f);
  }
}

describe("useOrderBook", () => {
  it("applies snapshot then incremental merge with size-zero removal", () => {
    const { result } = renderHook(() => useOrderBook("BTCUSDT"));

    act(() => {
      emitFor("BTCUSDT", {
        channel: "books", symbol: "BTCUSDT", action: "snapshot",
        data: { asks: [[101, 5], [102, 3]], bids: [[100, 4], [99, 2]], seq: 10 },
      });
    });
    expect(result.current.asks.map((l) => l.price)).toEqual([101, 102]);
    expect(result.current.bids.map((l) => l.price)).toEqual([100, 99]);
    expect(result.current.seq).toBe(10);
    expect(result.current.spread).toBe(1);

    act(() => {
      emitFor("BTCUSDT", {
        channel: "books", symbol: "BTCUSDT", action: "update",
        data: { asks: [[101, 6], [102, 0]], bids: [[100, 0]], seq: 11 },
      });
    });
    expect(result.current.asks.map((l) => [l.price, l.size])).toEqual([[101, 6]]);
    expect(result.current.bids.map((l) => l.price)).toEqual([99]);
    expect(result.current.seq).toBe(11);
  });

  it("isolates different symbols", () => {
    const { result } = renderHook(() => useOrderBook("ETHUSDT"));
    act(() => {
      emitFor("BTCUSDT", {
        channel: "books", symbol: "BTCUSDT", action: "snapshot",
        data: { asks: [[101, 5]], bids: [[100, 4]], seq: 1 },
      });
    });
    expect(result.current.asks).toEqual([]);
    expect(result.current.bids).toEqual([]);
  });
});
