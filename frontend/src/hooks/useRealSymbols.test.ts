// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Ticker } from "../api/types";
import { api } from "../api/client";
import { dedupeSymbols, tickerToSymbolInfo, useRealSymbols } from "./useRealSymbols";

vi.mock("../api/client", () => ({
  api: {
    tickers: vi.fn(),
  },
}));

vi.mock("./useExchangeSocket", () => ({
  useExchangeSocket: () => {},
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const ticker = (category?: string): Ticker =>
  ({
    instId: "BTCUSDT",
    symbol: "BTCUSDT",
    category,
    lastPr: "60000",
    price24hPcnt: "0.01",
  }) as Ticker;

describe("tickerToSymbolInfo category label", () => {
  it("shows Chinese labels for known categories", () => {
    expect(tickerToSymbolInfo(ticker("USDT-FUTURES")).exchange).toBe("U本位合约");
    expect(tickerToSymbolInfo(ticker("SPOT")).exchange).toBe("现货");
  });

  it("falls back to the raw value for unknown categories", () => {
    expect(tickerToSymbolInfo(ticker("SOMETHING")).exchange).toBe("SOMETHING");
  });

  it("leaves the exchange empty when category is missing", () => {
    expect(tickerToSymbolInfo(ticker(undefined)).exchange).toBe("");
  });
});

describe("dedupeSymbols", () => {
  const symbol = (instId: string, category: string, price: string) =>
    tickerToSymbolInfo({ instId, symbol: instId, category, lastPr: price, price24hPcnt: "0.01" } as Ticker);

  it("collapses the same instId across categories, preferring USDT-FUTURES", () => {
    const byKey = {
      "SPOT:ARIAUSDT": symbol("ARIAUSDT", "SPOT", "1.5"),
      "USDT-FUTURES:ARIAUSDT": symbol("ARIAUSDT", "USDT-FUTURES", "1.6"),
    };
    const out = dedupeSymbols(byKey);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("ARIAUSDT");
    expect(out[0]._productCategory).toBe("USDT-FUTURES");
    expect(out[0].price).toBe(1.6);
  });

  it("keeps a single-category symbol unchanged", () => {
    const byKey = { "USDT-FUTURES:BTCUSDT": symbol("BTCUSDT", "USDT-FUTURES", "60000") };
    const out = dedupeSymbols(byKey);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("BTCUSDT");
    expect(out[0]._productCategory).toBe("USDT-FUTURES");
  });

  it("resolves three-category conflicts by priority with unknown last", () => {
    const byKey = {
      "SOMETHING:ARIAUSDT": symbol("ARIAUSDT", "SOMETHING", "1.2"),
      "SPOT:ARIAUSDT": symbol("ARIAUSDT", "SPOT", "1.5"),
      "USDT-FUTURES:ARIAUSDT": symbol("ARIAUSDT", "USDT-FUTURES", "1.6"),
    };
    const out = dedupeSymbols(byKey);
    expect(out).toHaveLength(1);
    expect(out[0]._productCategory).toBe("USDT-FUTURES");
  });

  it("applies the same rule regardless of write order (snapshot then ws)", () => {
    const byKey = {
      "SPOT:BTCUSDT": symbol("BTCUSDT", "SPOT", "59000"),
      "USDT-FUTURES:BTCUSDT": symbol("BTCUSDT", "USDT-FUTURES", "60000"),
    };
    const out = dedupeSymbols(byKey);
    expect(out).toHaveLength(1);
    expect(out[0]._productCategory).toBe("USDT-FUTURES");
    expect(out[0].price).toBe(60000);
  });
});

describe("useRealSymbols unique ids", () => {
  it("returns a unique-id symbol list when the same instId is in SPOT and USDT-FUTURES", async () => {
    (api.tickers as ReturnType<typeof vi.fn>).mockResolvedValue({
      tickers: [
        { instId: "ARIAUSDT", symbol: "ARIAUSDT", category: "SPOT", lastPr: "1.5", price24hPcnt: "0.01" },
        { instId: "ARIAUSDT", symbol: "ARIAUSDT", category: "USDT-FUTURES", lastPr: "1.6", price24hPcnt: "0.01" },
        { instId: "BTCUSDT", symbol: "BTCUSDT", category: "USDT-FUTURES", lastPr: "60000", price24hPcnt: "0.01" },
      ],
    });
    const { result } = renderHook(() => useRealSymbols());
    await waitFor(() => expect(result.current.symbols.length).toBe(2));
    const ids = result.current.symbols.map((s) => s.id);
    expect(ids).toEqual(["ARIAUSDT", "BTCUSDT"]);
    expect(new Set(ids).size).toBe(ids.length);
    const aria = result.current.symbols.find((s) => s.id === "ARIAUSDT");
    expect(aria?._productCategory).toBe("USDT-FUTURES");
    expect(aria?.price).toBe(1.6);
  });
});
