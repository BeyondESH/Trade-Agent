// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ticker, TickerSortKey } from "../../api/types";

const m = vi.hoisted(() => ({
  items: [] as { key: number; index: number; start: number }[],
}));

// jsdom has no layout, so virtual scrolling never measures rows; stub it to
// render every item.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number }) => {
    m.items = Array.from({ length: opts.count }, (_, i) => ({ key: i, index: i, start: i * 30 }));
    return {
      getTotalSize: () => m.items.length * 30,
      getVirtualItems: () => m.items,
    };
  },
}));

import { MarketList } from "./MarketList";

const TICKERS: Ticker[] = [
  { instId: "BTCUSDT", symbol: "BTCUSDT", category: "USDT-FUTURES", lastPr: "60000", price24hPcnt: "-0.02", volume24h: "1000", fundingRate: "0.0001", markPrice: "60010", high24h: "61000", low24h: "59000" },
  { instId: "ETHUSDT", symbol: "ETHUSDT", category: "SPOT", lastPr: "3000", price24hPcnt: "0.05", volume24h: "2000", fundingRate: "-0.0002", markPrice: "3005", high24h: "3150", low24h: "3000" },
  { instId: "ETHUSDT", symbol: "ETHUSDT", category: "USDT-FUTURES", lastPr: "3001", price24hPcnt: "0.04", volume24h: "2100", fundingRate: "0.0003", markPrice: "3002", high24h: "3200", low24h: "2900" },
];

function props(overrides: Record<string, unknown> = {}) {
  return {
    tickers: TICKERS,
    search: "",
    tab: "all" as const,
    symbolType: "all" as const,
    sortKey: "change" as TickerSortKey,
    sortDir: "desc" as const,
    active: "USDT-FUTURES:BTCUSDT",
    onSearch: vi.fn(),
    onTab: vi.fn(),
    onSymbolType: vi.fn(),
    onSort: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  m.items = [];
});

describe("MarketList", () => {
  it("renders rows and fires select with composite category:symbol", () => {
    const onSelect = vi.fn();
    render(<MarketList {...props({ onSelect })} />);
    expect(screen.getAllByText("BTCUSDT").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ETHUSDT").length).toBe(2);
    fireEvent.click(screen.getByTestId("market-row-BTCUSDT"));
    expect(onSelect).toHaveBeenCalledWith("USDT-FUTURES:BTCUSDT");
  });

  it("keeps same-instId rows from different categories independent", () => {
    const onSelect = vi.fn();
    render(<MarketList {...props({ onSelect })} />);
    const rows = screen.getAllByTestId("market-row-ETHUSDT");
    expect(rows).toHaveLength(2);
    fireEvent.click(rows[0]);
    fireEvent.click(rows[1]);
    const calls = onSelect.mock.calls.map((c) => c[0]);
    expect(calls).toContain("SPOT:ETHUSDT");
    expect(calls).toContain("USDT-FUTURES:ETHUSDT");
  });

  it("does not render fundamental columns in the default (watchlist) mode", () => {
    render(<MarketList {...props()} />);
    expect(screen.queryByTestId("sort-funding")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sort-amplitude")).not.toBeInTheDocument();
  });

  it("renders Bitget fundamental columns and sorts by them in extended mode", () => {
    const onSort = vi.fn();
    render(<MarketList {...props({ extended: true, onSort })} />);
    expect(screen.getByTestId("sort-funding")).toBeInTheDocument();
    expect(screen.getByTestId("sort-mark")).toBeInTheDocument();
    expect(screen.getByTestId("sort-amplitude")).toBeInTheDocument();
    // funding 0.0001 -> +0.0100%
    expect(screen.getByText("+0.0100%")).toBeInTheDocument();
    // ETH(SPOT) amplitude (3150-3000)/3000 = 5%
    expect(screen.getByText("5.00%")).toBeInTheDocument();
    // mark price from hub field
    expect(screen.getByText("60010")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("sort-amplitude"));
    expect(onSort).toHaveBeenCalledWith("amplitude");
  });

  it("shows -- for missing extended values", () => {
    const incomplete: Ticker[] = [
      { instId: "SOLUSDT", symbol: "SOLUSDT", category: "USDT-FUTURES", lastPr: "150" },
    ];
    render(<MarketList {...props({ tickers: incomplete, extended: true })} />);
    const row = screen.getByTestId("market-row-SOLUSDT");
    expect(row.textContent).toContain("--");
  });

  it("fires search and sort", () => {
    const onSearch = vi.fn();
    const onSort = vi.fn();
    render(<MarketList {...props({ onSearch, onSort })} />);
    fireEvent.change(screen.getByPlaceholderText("搜索合约…"), { target: { value: "ETH" } });
    expect(onSearch).toHaveBeenCalledWith("ETH");
    fireEvent.click(screen.getByTestId("sort-price"));
    expect(onSort).toHaveBeenCalledWith("price");
  });

  it("fires category tab and symbolType filter", () => {
    const onTab = vi.fn();
    const onSymbolType = vi.fn();
    render(<MarketList {...props({ onTab, onSymbolType })} />);
    fireEvent.click(screen.getByTestId("cat-tab-SPOT"));
    expect(onTab).toHaveBeenCalledWith("SPOT");
    fireEvent.click(screen.getByTestId("type-filter-metal"));
    expect(onSymbolType).toHaveBeenCalledWith("metal");
  });
});
