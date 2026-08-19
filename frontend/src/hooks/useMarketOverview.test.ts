// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useMarketOverview, NETFLOW_NETWORK_OPTIONS } from "./useMarketOverview";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: { blockbeatsData: vi.fn() },
}));

function ok(data: unknown) {
  return { status: 0, data };
}

function mockAll(netflow: unknown = []) {
  const fn = vi.mocked(api.blockbeatsData);
  fn.mockImplementation((endpoint, opts) => {
    if (endpoint === "us10y" || endpoint === "dxy") {
      return Promise.resolve(ok([{ open: "4.5", close: "4.6", create_time: "2026-01-28 12:00:00" }]));
    }
    switch (endpoint) {
      case "btc_etf":
        return Promise.resolve(ok([{ date: "2026-01-28", day_net_inflow_million: "18.40", total_net_inflow_million: "120573.00" }]));
      case "ibit_fbtc":
        return Promise.resolve(ok({ ibit: [{ date: "2026-01-28", day_net_inflow: "111.70" }], fbtc: [{ date: "2026-01-28", day_net_inflow: "227.00" }] }));
      case "compliant_total":
        return Promise.resolve(ok([{ date: "2026-01-28", day_net_inflow: "12.34", total_net_inflow: "567.89" }]));
      case "bitfinex_long":
        return Promise.resolve(ok([{ symbol: "BTC", price: "107858.50", long: "45564" }]));
      case "bottom_top_indicator":
        return Promise.resolve(
          ok([
            { name: "市场脉动指数", info: "综合指标，小于20买，大于80卖", status: "", create_time: "2026-08-19 08:03:09" },
            { name: "整体市场流动性指数", info: "市值加权", status: "Hold", create_time: "2026-08-19 08:03:09" },
            { name: "USDC/USDT 溢价", info: "溢折价", status: "Buy", create_time: "2026-08-19 08:03:09" },
            { name: "逃顶信号", info: "测试", status: "Sell", create_time: "2026-08-19 08:03:09" },
          ]),
        );
      case "stablecoin_marketcap":
        return Promise.resolve(ok({ usdt: [{ date: "2026-01-28", market_cap: "100000000" }], usdc: [{ date: "2026-01-28", market_cap: "50000000" }] }));
      case "daily_tx":
        return Promise.resolve(ok([{ name: "bitcoin", name_capitalized: "Bitcoin", image: "x.png", data: [{ date: "2026-01-28", daily_transactions: "496208" }] }]));
      case "contract":
        return Promise.resolve(ok([{ date: "2026-01-28", hyperliquid_open_interest: "1", hyperliquid_volume: "2", bybit_open_interest: "3", bybit_volume: "4", binance_open_interest: "5", binance_volume: "6" }]));
      case "top10_netflow":
        return Promise.resolve(ok(netflow));
      default:
        return Promise.reject(new Error("unknown endpoint"));
    }
  });
  return fn;
}

describe("useMarketOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes every section from real BlockBeats payloads", async () => {
    mockAll([{ tokenSymbol: "SOL", logoUrl: "u", priceUsd: 194.35, netflow: 500, liquidity: 1000 }]);
    const { result } = renderHook(() => useMarketOverview());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.topCards.data?.etfNet).toBeCloseTo(18.4);
    expect(result.current.topCards.data?.etfTotal).toBeCloseTo(120573);
    expect(result.current.topCards.data?.ibit).toBeCloseTo(111.7);
    expect(result.current.topCards.data?.fbtc).toBeCloseTo(227);
    expect(result.current.topCards.data?.compliantNet).toBeCloseTo(12.34);
    expect(result.current.topCards.data?.compliantTotal).toBeCloseTo(567.89);
    expect(result.current.topCards.data?.longPrice).toBeCloseTo(107858.5);
    expect(result.current.topCards.data?.longCount).toBeCloseTo(45564);
    expect(result.current.topCards.data?.indicators).toHaveLength(4);
    expect(result.current.topCards.data?.indicators[0]).toEqual({
      name: "市场脉动指数",
      info: "综合指标，小于20买，大于80卖",
      status: "",
      createTime: "2026-08-19 08:03:09",
    });
    expect(result.current.topCards.data?.indicators.map((i) => i.status)).toEqual(["", "Hold", "Buy", "Sell"]);

    expect(result.current.macro.data?.us10y?.price).toBeCloseTo(4.6);
    expect(result.current.macro.data?.us10y?.up).toBe(true);
    expect(result.current.macro.data?.dxy?.series).toEqual([4.6]);

    expect(result.current.assets.data?.usdt).toBeCloseTo(100000000);
    expect(result.current.assets.data?.usdc).toBeCloseTo(50000000);
    expect(result.current.assets.data?.chains).toHaveLength(1);
    expect(result.current.assets.data?.chains[0].name).toBe("Bitcoin");
    expect(result.current.assets.data?.chains[0].volume).toBeCloseTo(496208);

    expect(result.current.contract.data?.rows[0]).toEqual(
      expect.objectContaining({ platform: "Hyperliquid", openInterest: 1, volume: 2 }),
    );
    expect(result.current.contract.data?.rows[2].platform).toBe("Binance");

    expect(result.current.netflow.data?.coins[0].symbol).toBe("SOL");
    expect(result.current.netflow.data?.coins[0].netflow).toBeCloseTo(500);
  });

  it("isolates a failing endpoint as missing (N/A), others still load", async () => {
    const fn = mockAll();
    fn.mockImplementation((endpoint, opts) => {
      if (endpoint === "btc_etf") return Promise.reject(new Error("boom"));
      if (endpoint === "us10y" || endpoint === "dxy") {
        return Promise.resolve(ok([{ open: "1", close: "2" }]));
      }
      if (endpoint === "top10_netflow") return Promise.resolve(ok([]));
      return Promise.resolve(ok(undefined));
    });
    const { result } = renderHook(() => useMarketOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // btc_etf failed -> that field is null (missing), not faked as 0
    expect(result.current.topCards.data?.etfNet).toBeNull();
    expect(result.current.topCards.data?.etfTotal).toBeNull();
    // bottom_top_indicator missing -> empty indicator list (renders N/A)
    expect(result.current.topCards.data?.indicators).toEqual([]);
    // macro still resolved
    expect(result.current.macro.data?.dxy?.price).toBeCloseTo(2);
  });

  it("keeps a real zero distinct from missing data", async () => {
    const fn = mockAll();
    fn.mockImplementation((endpoint) => {
      if (endpoint === "btc_etf") {
        return Promise.resolve(ok([{ date: "2026-01-28", day_net_inflow_million: "0", total_net_inflow_million: "100" }]));
      }
      if (endpoint === "us10y" || endpoint === "dxy") return Promise.resolve(ok([]));
      if (endpoint === "top10_netflow") return Promise.resolve(ok([]));
      return Promise.resolve(ok(undefined));
    });
    const { result } = renderHook(() => useMarketOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.topCards.data?.etfNet).toBe(0);
    // missing (us10y empty) stays undefined
    expect(result.current.macro.data?.us10y).toBeUndefined();
  });

  it("refetches netflow when network changes", async () => {
    const fn = mockAll([{ tokenSymbol: "SOL", netflow: 500 }]);
    const { result } = renderHook(() => useMarketOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(vi.mocked(api.blockbeatsData).mock.calls.some((c) => c[0] === "top10_netflow" && c[1]?.network === "solana")).toBe(true);

    act(() => result.current.setNetwork("ethereum"));
    await waitFor(() =>
      expect(vi.mocked(api.blockbeatsData).mock.calls.some((c) => c[0] === "top10_netflow" && c[1]?.network === "ethereum")).toBe(true),
    );
  });

  it("exposes network options for the selector", () => {
    expect(NETFLOW_NETWORK_OPTIONS).toContain("solana");
    expect(NETFLOW_NETWORK_OPTIONS).toContain("ethereum");
  });
});
