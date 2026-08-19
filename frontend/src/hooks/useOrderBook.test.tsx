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

  it("skips state update when the visible book is unchanged", () => {
    const { result } = renderHook(() => useOrderBook("BTCUSDT"));
    act(() => {
      emitFor("BTCUSDT", {
        channel: "books", symbol: "BTCUSDT", action: "snapshot",
        data: { asks: [[101, 5], [102, 3]], bids: [[100, 4], [99, 2]], seq: 10 },
      });
    });
    const ref = result.current;
    act(() => {
      emitFor("BTCUSDT", {
        channel: "books", symbol: "BTCUSDT", action: "update",
        data: { asks: [[101, 5], [102, 3]], bids: [[100, 4], [99, 2]], seq: 11 },
      });
    });
    // identical levels -> same reference, no re-render churn
    expect(result.current).toBe(ref);
  });

  it("updates when the best level size changes", () => {
    const { result } = renderHook(() => useOrderBook("BTCUSDT"));
    act(() => {
      emitFor("BTCUSDT", {
        channel: "books", symbol: "BTCUSDT", action: "snapshot",
        data: { asks: [[101, 5]], bids: [[100, 4]], seq: 10 },
      });
    });
    act(() => {
      emitFor("BTCUSDT", {
        channel: "books", symbol: "BTCUSDT", action: "update",
        data: { asks: [[101, 9]], bids: [], seq: 11 },
      });
    });
    expect(result.current.asks).toEqual([{ price: 101, size: 9 }]);
  });

  it("clears the book immediately when the symbol changes", () => {
    const { result, rerender } = renderHook(
      (props: { symbol: string }) => useOrderBook(props.symbol),
      { initialProps: { symbol: "BTCUSDT" } },
    );
    act(() => {
      emitFor("BTCUSDT", {
        channel: "books", symbol: "BTCUSDT", action: "snapshot",
        data: { asks: [[101, 5]], bids: [[100, 4]], seq: 10 },
      });
    });
    expect(result.current.asks).toEqual([{ price: 101, size: 5 }]);

    // switching symbol resets to empty before the new snapshot arrives
    act(() => {
      rerender({ symbol: "ETHUSDT" });
    });
    expect(result.current.asks).toEqual([]);
    expect(result.current.bids).toEqual([]);
    expect(result.current.seq).toBeNull();
    expect(result.current.spread).toBeNull();
  });

  it("replaces the whole book on snapshot, dropping stale previous levels", () => {
    const { result } = renderHook(() => useOrderBook("BTCUSDT"));
    // first snapshot for BTC
    act(() => {
      emitFor("BTCUSDT", {
        channel: "books", symbol: "BTCUSDT", action: "snapshot",
        data: { asks: [[64000, 5]], bids: [[63990, 4]], seq: 1 },
      });
    });
    // a second snapshot for the same symbol that no longer contains the old levels
    act(() => {
      emitFor("BTCUSDT", {
        channel: "books", symbol: "BTCUSDT", action: "snapshot",
        data: { asks: [[64010, 7]], bids: [], seq: 2 },
      });
    });
    // old levels are gone entirely (replace semantics, not merge)
    expect(result.current.asks).toEqual([{ price: 64010, size: 7 }]);
    expect(result.current.bids).toEqual([]);
    expect(result.current.seq).toBe(2);
    expect(result.current.spread).toBeNull();
  });

  it("keeps incremental merge for update frames after a snapshot", () => {
    const { result } = renderHook(() => useOrderBook("BTCUSDT"));
    act(() => {
      emitFor("BTCUSDT", {
        channel: "books", symbol: "BTCUSDT", action: "snapshot",
        data: { asks: [[101, 5], [102, 3]], bids: [[100, 4], [99, 2]], seq: 10 },
      });
    });
    act(() => {
      emitFor("BTCUSDT", {
        channel: "books", symbol: "BTCUSDT", action: "update",
        data: { asks: [[101, 8]], bids: [[100, 0]], seq: 11 },
      });
    });
    // update merges: size-0 removes, unchanged levels survive
    expect(result.current.asks.map((l) => [l.price, l.size])).toEqual([[101, 8], [102, 3]]);
    expect(result.current.bids.map((l) => l.price)).toEqual([99]);
  });

  it("does not mix levels across symbol changes after snapshots", () => {
    const { result, rerender } = renderHook(
      (props: { symbol: string }) => useOrderBook(props.symbol),
      { initialProps: { symbol: "ETHUSDT" } },
    );
    act(() => {
      emitFor("ETHUSDT", {
        channel: "books", symbol: "ETHUSDT", action: "snapshot",
        data: { asks: [[3000, 5]], bids: [[2995, 4]], seq: 1 },
      });
    });
    expect(result.current.asks.map((l) => l.price)).toEqual([3000]);

    act(() => {
      rerender({ symbol: "BTCUSDT" });
    });
    act(() => {
      emitFor("BTCUSDT", {
        channel: "books", symbol: "BTCUSDT", action: "snapshot",
        data: { asks: [[64000, 7]], bids: [], seq: 2 },
      });
    });
    // only BTC levels remain; ETH levels dropped by reset + snapshot replace
    expect(result.current.asks.map((l) => l.price)).toEqual([64000]);
    expect(result.current.bids).toEqual([]);
    expect(result.current.seq).toBe(2);
  });
});
