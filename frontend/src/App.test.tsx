// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  candles: vi.fn(),
  candlesRecent: vi.fn(),
  analyze: vi.fn(),
  structure: vi.fn(),
  agentDecide: vi.fn(),
}));

vi.mock("./api/client", () => ({
  api: {
    candles: m.candles,
    candlesRecent: m.candlesRecent,
    analyze: m.analyze,
    structure: m.structure,
    agentDecide: m.agentDecide,
  },
}));

// The chart needs a real canvas + Solid runtime; stub it for the layout test.
vi.mock("./components/chart/KLineChartProView", () => ({
  KLineChartProView: forwardRef(() => <div data-testid="chart" />),
}));

import App from "./App";

beforeEach(() => {
  vi.clearAllMocks();
  m.candles.mockResolvedValue({ candles: [], count: 0 });
  m.candlesRecent.mockResolvedValue({ candles: [], count: 0 });
  m.analyze.mockResolvedValue({ price: 100, indicators: {}, levels: [] });
  m.structure.mockResolvedValue({ swings: [], trendlines: [], box: null, liquidity: [], order_blocks: {}, bos_choch: [] });
  m.agentDecide.mockResolvedValue({ action: "hold", symbol: "BTCUSDT", side: null, reference_price: 100, reason: "hold", confidence: 0.5 });
});

describe("App terminal layout", () => {
  it("renders market list with symbols", async () => {
    render(<App />);
    expect(screen.getAllByText("BTCUSDT").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("ETHUSDT")).toBeInTheDocument();
    expect(screen.getByText("SOLUSDT")).toBeInTheDocument();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  it("selecting a symbol updates the header", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("ETHUSDT"));
    await waitFor(() => expect(screen.getByText("◆ AI-Trade").nextElementSibling?.textContent).toBe("ETHUSDT"));
  });
});
