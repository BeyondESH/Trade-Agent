// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  candles: vi.fn(),
  candlesRecent: vi.fn(),
  analyze: vi.fn(),
  structure: vi.fn(),
  agentDecide: vi.fn(),
  tickers: vi.fn(),
  instruments: vi.fn(),
  saveChartConfig: vi.fn(),
  chartConfig: vi.fn(),
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
    saveChartConfig: m.saveChartConfig,
    chartConfig: m.chartConfig,
  },
}));

// The real chart needs a canvas + Solid runtime; stub the grid for the shell test.
vi.mock("./components/chart/ChartGrid", () => ({
  ChartGrid: () => <div data-testid="chart" />,
  CHART_LAYOUTS: [1, 2, 4, 6, 8],
}));

// The market hub hooks use a real WebSocket; stub them with canned data.
vi.mock("./hooks/useExchangeSocket", () => ({
  useExchangeSocket: () => {},
}));
vi.mock("./hooks/useTickerList", () => ({
  symbolKey: (instId: string, category?: string | null) => `${category ?? "USDT-FUTURES"}:${instId}`,
  amplitudeOf: () => null,
  useTickerList: () => ({
    tickers: [
      { instId: "BTCUSDT", symbol: "BTCUSDT", lastPr: "60000", price24hPcnt: "-0.02", volume24h: "1000" },
      { instId: "ETHUSDT", symbol: "ETHUSDT", lastPr: "3000", price24hPcnt: "0.05", volume24h: "2000" },
      { instId: "SOLUSDT", symbol: "SOLUSDT", lastPr: "150", price24hPcnt: "0.01", volume24h: "500" },
    ],
    search: "",
    tab: "all",
    symbolType: "all",
    sortKey: "change",
    sortDir: "desc",
    setSearch: () => {},
    setTab: () => {},
    setSymbolType: () => {},
    setSort: () => {},
    symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    priceMap: { BTCUSDT: 60000, ETHUSDT: 3000, SOLUSDT: 150 },
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

// jsdom has no layout, so virtual scrolling never measures rows; stub it to
// render every item.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number }) => {
    const items = Array.from({ length: opts.count }, (_, i) => ({ key: i, index: i, start: i * 30 }));
    return {
      getTotalSize: () => items.length * 30,
      getVirtualItems: () => items,
    };
  },
}));

import App from "./App";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  m.candles.mockResolvedValue({ candles: [], count: 0 });
  m.candlesRecent.mockResolvedValue({ candles: [], count: 0 });
  m.analyze.mockResolvedValue({ price: 100, indicators: {}, levels: [] });
  m.structure.mockResolvedValue({ swings: [], trendlines: [], box: null, liquidity: [], order_blocks: {}, bos_choch: [] });
  m.agentDecide.mockResolvedValue({ action: "hold", symbol: "BTCUSDT", side: null, reference_price: 100, reason: "hold", confidence: 0.5 });
  m.tickers.mockResolvedValue({ tickers: [] });
  m.instruments.mockResolvedValue({ instruments: [] });
  m.chartConfig.mockResolvedValue({ indicators: [], drawings: [], layers: {} });
});

describe("App TV shell", () => {
  it("renders the five TV regions and the watchlist", async () => {
    render(<App />);
    expect(screen.getByTestId("tv-top-bar")).toBeInTheDocument();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
    expect(screen.getByTestId("tv-right-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("tv-bottom-dock")).toBeInTheDocument();
    expect(screen.getByTestId("tv-status-bar")).toBeInTheDocument();
    expect(screen.getByText("ETHUSDT")).toBeInTheDocument();
    expect(screen.getByText("SOLUSDT")).toBeInTheDocument();
  });

  it("selecting a symbol in the watchlist updates the top bar", async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("market-row-ETHUSDT"));
    await waitFor(() => {
      expect(screen.getByTestId("topbar-symbol").textContent).toContain("ETHUSDT");
    });
  });

  it("switching the right rail tab shows the alerts panel", async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("rail-alerts"));
    await waitFor(() => {
      expect(screen.getByTestId("alerts-panel")).toBeInTheDocument();
    });
  });

  it("expanding the bottom dock shows the AI panel", async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("dock-tab-ai"));
    await waitFor(() => {
      expect(screen.getByTestId("dock-panel")).toBeInTheDocument();
    });
  });
});
