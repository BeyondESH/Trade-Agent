// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TickerSortKey } from "../../api/types";

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

const TICKERS = [
  { instId: "BTCUSDT", symbol: "BTCUSDT", lastPr: "60000", price24hPcnt: "-0.02", volume24h: "1000" },
  { instId: "ETHUSDT", symbol: "ETHUSDT", lastPr: "3000", price24hPcnt: "0.05", volume24h: "2000" },
];

function props(overrides: Record<string, unknown> = {}) {
  return {
    tickers: TICKERS,
    search: "",
    sortKey: "change" as TickerSortKey,
    sortDir: "desc" as const,
    active: "BTCUSDT",
    onSearch: vi.fn(),
    onSort: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  m.items = [];
});

describe("MarketList", () => {
  it("renders rows and fires select", () => {
    const onSelect = vi.fn();
    render(<MarketList {...props({ onSelect })} />);
    expect(screen.getByText("BTCUSDT")).toBeInTheDocument();
    expect(screen.getByText("ETHUSDT")).toBeInTheDocument();
    fireEvent.click(screen.getByText("BTCUSDT"));
    expect(onSelect).toHaveBeenCalledWith("BTCUSDT");
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
});
