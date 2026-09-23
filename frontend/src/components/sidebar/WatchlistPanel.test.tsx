// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SymbolInfo } from "../../types/trading";
import { WatchlistPanel } from "./WatchlistPanel";

const SYMBOL: SymbolInfo = {
  id: "BTCUSDT",
  ticker: "BTCUSDT",
  name: "BTC Perpetual",
  exchange: "U本位合约",
  category: "crypto",
  price: 60000,
  change24h: 0,
  change24hPercent: 1,
  high24h: 61000,
  low24h: 59000,
  volume24h: "1B",
  digits: 2,
  baseAsset: "BTC",
  quoteAsset: "USDT",
  description: "",
  marketCap: "$1.2T",
  _productCategory: "USDT-FUTURES",
};

describe("WatchlistPanel localization", () => {
  it("renders localized snapshot labels instead of hardcoded literals", () => {
    render(
      <WatchlistPanel
        symbols={[SYMBOL]}
        activeSymbol={SYMBOL}
        onSelectSymbol={vi.fn()}
        onAddSymbol={vi.fn()}
        theme="dark"
      />,
    );

    expect(screen.getByText("日内区间")).toBeInTheDocument();
    expect(screen.getByText("24小时成交量")).toBeInTheDocument();
    expect(screen.getByText("市值")).toBeInTheDocument();
    // Missing technical rating falls back through t("Neutral").
    expect(screen.getByText("中性")).toBeInTheDocument();
  });
});
