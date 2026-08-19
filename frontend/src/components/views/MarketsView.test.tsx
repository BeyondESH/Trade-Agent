// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MarketsView } from "./MarketsView";
import type { MarketOverview, TopIndicatorRow } from "../../hooks/useMarketOverview";

const state = vi.hoisted(() => ({ overview: undefined as unknown as MarketOverview }));

vi.mock("../../hooks/useMarketOverview", () => ({
  useMarketOverview: () => state.overview,
  NETFLOW_NETWORK_OPTIONS: ["solana", "ethereum", "base", "bsc", "arbitrum", "ton"],
}));

function mkOverview(indicators: TopIndicatorRow[]): MarketOverview {
  return {
    topCards: {
      data: {
        etfNet: null,
        etfTotal: null,
        compliantNet: null,
        compliantTotal: null,
        ibit: null,
        fbtc: null,
        longPrice: null,
        longCount: null,
        indicators,
      },
    },
    macro: { data: undefined },
    assets: { data: undefined },
    contract: { data: undefined },
    netflow: { data: undefined },
    loading: false,
    network: "solana",
    setNetwork: () => {},
  };
}

describe("MarketsView IndicatorCard", () => {
  beforeEach(() => {
    state.overview = mkOverview([]);
  });

  it("renders every indicator row with a signal badge and the data time", () => {
    state.overview = mkOverview([
      { name: "市场脉动指数", info: "综合", status: "Buy", createTime: "2026-08-19 08:03:09" },
      { name: "整体市场流动性指数", info: "加权", status: "Hold", createTime: "2026-08-19 08:03:09" },
      { name: "逃顶信号", info: "测试", status: "Sell", createTime: "2026-08-19 08:03:09" },
      { name: "无信号指标", info: "", status: "", createTime: "" },
    ]);
    render(<MarketsView theme="dark" />);
    const card = screen.getByTestId("indicator-card");
    expect(within(card).getByText("市场脉动指数")).toBeTruthy();
    expect(within(card).getByText("整体市场流动性指数")).toBeTruthy();
    expect(within(card).getByText("逃顶信号")).toBeTruthy();
    expect(within(card).getByText("BUY")).toBeTruthy();
    expect(within(card).getByText("HOLD")).toBeTruthy();
    expect(within(card).getByText("SELL")).toBeTruthy();
    expect(within(card).getByText("N/A")).toBeTruthy();
    expect(within(card).getByText("08:03 UTC")).toBeTruthy();
  });

  it("shows an N/A placeholder when there is no indicator data", () => {
    render(<MarketsView theme="dark" />);
    const card = screen.getByTestId("indicator-card");
    expect(within(card).getByText("N/A")).toBeTruthy();
    expect(within(card).queryByText("BUY")).toBeNull();
    expect(within(card).queryByText("08:03 UTC")).toBeNull();
  });
});
