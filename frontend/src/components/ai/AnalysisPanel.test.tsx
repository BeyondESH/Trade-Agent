// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  analyze: vi.fn(),
  agentDecide: vi.fn(),
}));

vi.mock("../../api/client", () => ({ api: { analyze: m.analyze, agentDecide: m.agentDecide } }));

import { AnalysisPanel } from "./AnalysisPanel";

beforeEach(() => {
  vi.clearAllMocks();
  m.analyze.mockResolvedValue({
    price: 100,
    indicators: { macd_hist: 0.5, kdj_k: 50 },
    levels: [],
  });
  m.agentDecide.mockResolvedValue({
    action: "open",
    symbol: "BTCUSDT",
    side: "long",
    reference_price: 100,
    reason: "price near strong support",
    confidence: 0.6,
  });
});

describe("AnalysisPanel", () => {
  it("renders the agent decision and indicator values", async () => {
    render(<AnalysisPanel symbol="BTCUSDT" timeframe="5m" />);
    await waitFor(() => expect(screen.getByText(/open/i)).toBeInTheDocument());
    expect(screen.getByText("long")).toBeInTheDocument();
    expect(screen.getByText(/price near strong support/i)).toBeInTheDocument();
    expect(screen.getByText(/60%/)).toBeInTheDocument();
    expect(screen.getByText("0.500")).toBeInTheDocument();
  });
});
