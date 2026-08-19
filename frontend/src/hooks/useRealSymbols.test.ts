// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Ticker } from "../api/types";
import { tickerToSymbolInfo } from "./useRealSymbols";

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
