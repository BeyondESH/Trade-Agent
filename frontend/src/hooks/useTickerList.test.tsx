// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WsFrame } from "./useExchangeSocket";
import { useTickerList } from "./useTickerList";

const m = vi.hoisted(() => ({
  tickers: vi.fn(),
}));

vi.mock("../api/client", () => ({ api: { tickers: m.tickers } }));

const listeners: Array<{ channel: string; symbol: string; fn: (f: WsFrame) => void }> = [];

vi.mock("./useExchangeSocket", () => ({
  useExchangeSocket: (channel: string, symbol: string, onFrame: (f: WsFrame) => void) => {
    listeners.push({ channel, symbol, fn: onFrame });
  },
}));

const TICKERS = [
  { instId: "BTCUSDT", symbol: "BTCUSDT", lastPr: "60000", price24hPcnt: "-0.02", volume24h: "1000" },
  { instId: "ETHUSDT", symbol: "ETHUSDT", lastPr: "3000", price24hPcnt: "0.05", volume24h: "2000" },
];

function emit(f: WsFrame): void {
  for (const l of listeners) l.fn(f);
}

beforeEach(() => {
  vi.clearAllMocks();
  listeners.length = 0;
  m.tickers.mockResolvedValue({ tickers: TICKERS });
});

describe("useTickerList", () => {
  it("loads snapshot and sorts by change desc by default", async () => {
    const { result } = renderHook(() => useTickerList());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.tickers.map((t) => t.symbol)).toEqual(["ETHUSDT", "BTCUSDT"]);
  });

  it("applies ws updates and search", async () => {
    const { result } = renderHook(() => useTickerList());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      emit({ channel: "ticker", symbol: "default", action: "update", data: [
        { instId: "BTCUSDT", symbol: "BTCUSDT", lastPr: "61000", price24hPcnt: "0.01", volume24h: "1200" },
      ] });
    });
    const btc = result.current.tickers.find((t) => t.symbol === "BTCUSDT");
    expect(btc?.lastPr).toBe("61000");
    act(() => result.current.setSearch("ETH"));
    expect(result.current.tickers.map((t) => t.symbol)).toEqual(["ETHUSDT"]);
  });

  it("toggles sort direction and switches columns", async () => {
    const { result } = renderHook(() => useTickerList());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.setSort("volume"));
    // desc by volume -> ETH first
    expect(result.current.tickers[0].symbol).toBe("ETHUSDT");
    act(() => result.current.setSort("volume"));
    // asc -> BTC first
    expect(result.current.tickers[0].symbol).toBe("BTCUSDT");
  });
});
