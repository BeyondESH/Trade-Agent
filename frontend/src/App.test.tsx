// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  candles: vi.fn(),
  candlesRecent: vi.fn(),
  analyze: vi.fn(),
  structure: vi.fn(),
  agentDecide: vi.fn(),
  tickers: vi.fn(),
  instruments: vi.fn(),
}));

vi.mock("./api/client", () => ({
  api: {
    candles: m.candles,
    candlesRecent: m.candlesRecent,
    analyze: m.analyze,
    structure: m.structure,
    agentDecide: m.agentDecide,
    tickers: m.tickers,
    instruments: m.instruments,
  },
}));

// The chart needs a real canvas + Solid runtime; stub it for the layout test.
vi.mock("./components/chart/KLineChartProView", () => ({
  KLineChartProView: forwardRef(() => <div data-testid="chart" />),
}));

// gridstack needs layout measurement jsdom can't provide; render children inline.
vi.mock("./lib/gridStackLayout", () => ({
  GridStackLayout: ({ panelIds, children }: { panelIds: string[]; children: (id: string) => React.ReactNode }) => (
    <div data-testid="gridstack-layout">{panelIds.map((id) => <div key={id} data-panel={id}>{children(id)}</div>)}</div>
  ),
}));

// The market hub hooks use a real WebSocket; stub them with canned data.
vi.mock("./hooks/useExchangeSocket", () => ({
  useExchangeSocket: () => {},
}));
vi.mock("./hooks/useTickerList", () => ({
  useTickerList: () => ({
    tickers: [
      { instId: "BTCUSDT", symbol: "BTCUSDT", lastPr: "60000", price24hPcnt: "-0.02", volume24h: "1000" },
      { instId: "ETHUSDT", symbol: "ETHUSDT", lastPr: "3000", price24hPcnt: "0.05", volume24h: "2000" },
      { instId: "SOLUSDT", symbol: "SOLUSDT", lastPr: "150", price24hPcnt: "0.01", volume24h: "500" },
    ],
    search: "",
    sortKey: "change",
    sortDir: "desc",
    setSearch: () => {},
    setTab: () => {},
    setSort: () => {},
    symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
  }),
}));
vi.mock("./hooks/useOrderBook", () => ({
  useOrderBook: () => ({ asks: [], bids: [], seq: null, spread: null }),
}));
vi.mock("./hooks/useTrades", () => ({
  useTrades: () => [],
}));
vi.mock("./hooks/useDerivative", () => ({
  useDerivative: () => ({ funding: null, markPrice: null }),
}));

import App from "./App";

beforeEach(() => {
  vi.clearAllMocks();
  m.candles.mockResolvedValue({ candles: [], count: 0 });
  m.candlesRecent.mockResolvedValue({ candles: [], count: 0 });
  m.analyze.mockResolvedValue({ price: 100, indicators: {}, levels: [] });
  m.structure.mockResolvedValue({ swings: [], trendlines: [], box: null, liquidity: [], order_blocks: {}, bos_choch: [] });
  m.agentDecide.mockResolvedValue({ action: "hold", symbol: "BTCUSDT", side: null, reference_price: 100, reason: "hold", confidence: 0.5 });
  m.tickers.mockResolvedValue({ tickers: [] });
  m.instruments.mockResolvedValue({ instruments: [] });
});

describe("App terminal layout", () => {
  it("renders market list with symbols", async () => {
    render(<App />);
    expect(screen.getAllByText("BTCUSDT").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("ETHUSDT")).toBeInTheDocument();
    expect(screen.getByText("SOLUSDT")).toBeInTheDocument();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
    expect(screen.getByText("订单簿 / 成交")).toBeInTheDocument();
    expect(screen.getByText("最新成交")).toBeInTheDocument();
    expect(screen.getByText(/AI 分析模块预留/)).toBeInTheDocument();
    expect(screen.getByText("RaiBro Trading")).toBeInTheDocument();
  });

  it("selecting a symbol updates the header", async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("ticker-ETHUSDT"));
    await waitFor(() => expect(screen.getByText("RaiBro Trading").nextElementSibling?.textContent).toBe("ETHUSDT"));
  });
});
