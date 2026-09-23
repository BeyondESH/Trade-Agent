// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ticker } from "../../api/types";
import type { TickerListState } from "../../hooks/useTickerList";
import type { SymbolInfo } from "../../types/trading";
import { ScreenerPanel } from "./ScreenerPanel";

const holder = vi.hoisted<{ fn: () => TickerListState }>(() => ({
  fn: () => {
    throw new Error("useTickerList not configured");
  },
}));

vi.mock("../../hooks/useTickerList", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../hooks/useTickerList")>();
  return { ...actual, useTickerList: () => holder.fn() };
});

function makeState(over: Partial<TickerListState> = {}): TickerListState {
  return {
    tickers: [],
    search: "",
    tab: "all",
    symbolType: "all",
    sortKey: "change",
    sortDir: "desc",
    setSearch: vi.fn(),
    setTab: vi.fn(),
    setSymbolType: vi.fn(),
    setSort: vi.fn(),
    symbols: [],
    priceMap: {},
    ...over,
  };
}

const BTC: SymbolInfo = {
  id: "BTCUSDT",
  ticker: "BTCUSDT",
  name: "BTC Perpetual",
  exchange: "U本位合约",
  category: "crypto",
  price: 60000,
  change24h: 0,
  change24hPercent: 1.5,
  high24h: 61000,
  low24h: 59000,
  volume24h: "1B",
  digits: 2,
  baseAsset: "BTC",
  quoteAsset: "USDT",
  description: "",
};

beforeEach(() => {
  holder.fn = () => makeState();
});

describe("ScreenerPanel live wiring", () => {
  it("renders real hub fields and never the removed mock rows", () => {
    const ticker: Ticker = {
      instId: "BTCUSDT",
      symbol: "BTCUSDT",
      lastPr: "60123.45",
      price24hPcnt: "1.23",
      fundingRate: "0.0001",
      markPrice: "60100.5",
      high24h: "61000",
      low24h: "59000",
      quoteVolume: "1500000000",
    };
    holder.fn = () => makeState({ tickers: [ticker], symbols: ["USDT-FUTURES:BTCUSDT"] });
    const { getByTestId, queryByText } = render(
      <ScreenerPanel symbols={[BTC]} onSelectSymbol={vi.fn()} theme="dark" />,
    );
    const row = getByTestId("screener-row-BTCUSDT");
    expect(row.textContent).toContain("60,123.45");
    expect(row.textContent).toContain("+1.23%");
    expect(row.textContent).toContain("+0.0100%");
    expect(row.textContent).toContain("60,100.5");
    // amplitude (61000-59000)/59000 = 3.39%
    expect(row.textContent).toContain("+3.39%");
    expect(row.textContent).toContain("1.50B");
    // The old template mock values must be gone.
    expect(queryByText("NVDA")).toBeNull();
  });

  it("shows placeholders (never mock numbers) for missing dimensions", () => {
    const sparse: Ticker = { instId: "ETHUSDT", symbol: "ETHUSDT", lastPr: "3000" };
    holder.fn = () => makeState({ tickers: [sparse] });
    const { getByTestId } = render(
      <ScreenerPanel symbols={[]} onSelectSymbol={vi.fn()} theme="dark" />,
    );
    const row = getByTestId("screener-row-ETHUSDT");
    expect(row.textContent).toContain("--");
    // no funding/mark/amplitude/turnover values
    expect(row.textContent).not.toContain("+0.");
  });

  it("wires column headers to setSort", () => {
    const setSort = vi.fn();
    holder.fn = () => makeState({ setSort });
    const { getByTestId } = render(
      <ScreenerPanel symbols={[]} onSelectSymbol={vi.fn()} theme="dark" />,
    );
    fireEvent.click(getByTestId("screener-sort-funding"));
    expect(setSort).toHaveBeenCalledWith("funding");
    fireEvent.click(getByTestId("screener-sort-amplitude"));
    expect(setSort).toHaveBeenCalledWith("amplitude");
  });

  it("wires category tabs and search to the hook", () => {
    const setTab = vi.fn();
    const setSearch = vi.fn();
    holder.fn = () => makeState({ setTab, setSearch });
    const { getByTestId, getByPlaceholderText } = render(
      <ScreenerPanel symbols={[]} onSelectSymbol={vi.fn()} theme="dark" />,
    );
    fireEvent.click(getByTestId("screener-tab-USDT-FUTURES"));
    expect(setTab).toHaveBeenCalledWith("USDT-FUTURES");
    fireEvent.change(getByPlaceholderText("搜索品种..."), { target: { value: "btc" } });
    expect(setSearch).toHaveBeenCalledWith("btc");
  });

  it("maps a selected row back to a SymbolInfo and calls onSelectSymbol", () => {
    const onSelectSymbol = vi.fn();
    const ticker: Ticker = { instId: "BTCUSDT", symbol: "BTCUSDT", lastPr: "60000" };
    holder.fn = () => makeState({ tickers: [ticker] });
    const { getByTestId } = render(
      <ScreenerPanel symbols={[BTC]} onSelectSymbol={onSelectSymbol} theme="dark" />,
    );
    fireEvent.click(getByTestId("screener-row-BTCUSDT"));
    expect(onSelectSymbol).toHaveBeenCalledWith(BTC);
  });

  it("renders an empty state when the hub has no tickers", () => {
    holder.fn = () => makeState();
    const { getByText } = render(
      <ScreenerPanel symbols={[]} onSelectSymbol={vi.fn()} theme="dark" />,
    );
    expect(getByText("暂无行情数据")).toBeTruthy();
  });
});
