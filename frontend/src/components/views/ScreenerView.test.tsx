// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SymbolInfo } from "../../types/trading";
import { ScreenerView } from "./ScreenerView";

const createObjectURL = vi.fn((_blob: Blob) => "blob:mock");
const revokeObjectURL = vi.fn();

function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function makeSymbol(id: string, name: string): SymbolInfo {
  return {
    id,
    ticker: id,
    name,
    exchange: "U本位合约",
    category: "crypto",
    price: 60000,
    change24h: 0,
    change24hPercent: 1.5,
    high24h: 61000,
    low24h: 59000,
    volume24h: "1B",
    digits: 2,
    baseAsset: id.replace("USDT", ""),
    quoteAsset: "USDT",
    description: "",
  };
}

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

describe("ScreenerView export + removed inert control", () => {
  it("exports the filtered rows to a CSV download", async () => {
    const { getByTestId } = render(
      <ScreenerView
        symbols={[makeSymbol("BTCUSDT", "Bitcoin"), makeSymbol("ETHUSDT", "Ethereum")]}
        onOpenChartWithTicker={vi.fn()}
        theme="dark"
      />,
    );
    fireEvent.click(getByTestId("screener-export-csv"));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    const text = await blobToText(blob);
    expect(text).toContain("Ticker,Asset,Category");
    expect(text).toContain("BTCUSDT");
    expect(text).toContain("ETHUSDT");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("no longer renders the inert Auto-Refresh button", () => {
    const { queryByText } = render(
      <ScreenerView symbols={[]} onOpenChartWithTicker={vi.fn()} theme="dark" />,
    );
    expect(queryByText("自动刷新 (1s)")).toBeNull();
  });
});
