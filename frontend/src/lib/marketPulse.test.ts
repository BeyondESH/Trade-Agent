import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  flattenValue,
  extractTrend,
  extractSeries,
  parseNetflow,
  fetchMarketPulseEntry,
  fetchNetflow,
  MARKET_PULSE_ENDPOINTS,
  NETFLOW_NETWORKS,
} from "./marketPulse";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: { blockbeatsData: vi.fn() },
}));

describe("marketPulse helpers", () => {
  it("flattens nested objects compactly", () => {
    expect(flattenValue({ a: 1, b: { c: "x" } })).toBe("a: 1  b: c: x");
    expect(flattenValue(null)).toBe("N/A");
    expect(flattenValue(3.14159)).toBe("3.142");
  });

  it("extracts a numeric trend from nested payloads", () => {
    expect(extractTrend({ data: { value: 42 } })).toBe(42);
    expect(extractTrend([{ x: 1 }, { y: -3 }])).toBe(1);
    expect(extractTrend("unrelated")).toBe(null);
  });

  it("extracts a numeric series for the DXY sparkline", () => {
    const series = extractSeries({ list: [{ value: 1 }, { value: 3 }, { value: 2 }] });
    expect(series).toEqual([1, 3, 2]);
  });

  it("exposes 10 labeled endpoints", () => {
    expect(MARKET_PULSE_ENDPOINTS).toHaveLength(10);
    expect(MARKET_PULSE_ENDPOINTS.map((e) => e.endpoint)).toContain("dxy");
    expect(MARKET_PULSE_ENDPOINTS.map((e) => e.endpoint)).toContain("bottom_top_indicator");
    expect(MARKET_PULSE_ENDPOINTS.map((e) => e.endpoint)).not.toContain("top10_netflow");
  });

  it("parses top10_netflow rows, sorted by |netflow|", () => {
    const rows = parseNetflow({
      data: [
        { symbol: "SOL", netflow: 500 },
        { token: "ETH", amount: 900 },
        { coin: "BTC", net_flow: -700 },
        { symbol: "", netflow: 1 },
      ],
    });
    expect(rows).toEqual([
      { symbol: "ETH", netflow: 900 },
      { symbol: "BTC", netflow: -700 },
      { symbol: "SOL", netflow: 500 },
    ]);
  });

  it("returns an empty array for unparseable payloads", () => {
    expect(parseNetflow({})).toEqual([]);
    expect(parseNetflow(null)).toEqual([]);
  });
});

describe("data fetching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the right endpoint for Market Pulse", async () => {
    vi.mocked(api.blockbeatsData).mockResolvedValue({ status: 0, data: { value: 103.5 } });
    const entry = await fetchMarketPulseEntry("dxy", "US Dollar Index (DXY)");
    expect(api.blockbeatsData).toHaveBeenCalledWith("dxy");
    expect(entry.label).toBe("US Dollar Index (DXY)");
    expect(entry.value).toContain("103.5");
    expect(entry.trend).toBe(103.5);
  });

  it("tolerates upstream failures as N/A", async () => {
    vi.mocked(api.blockbeatsData).mockRejectedValue(new Error("boom"));
    const entry = await fetchMarketPulseEntry("btc_etf", "BTC Spot ETF Net Flow");
    expect(entry.value).toBe("N/A");
    expect(entry.trend).toBe(null);
  });

  it("fetches netflow with a network param", async () => {
    vi.mocked(api.blockbeatsData).mockResolvedValue({
      status: 0,
      data: { solana: [{ symbol: "WIF", netflow: 1234 }] },
    });
    const rows = await fetchNetflow("solana");
    expect(api.blockbeatsData).toHaveBeenCalledWith("top10_netflow", "solana");
    expect(rows).toEqual([{ symbol: "WIF", netflow: 1234 }]);
  });

  it("exposes networks for the selector", () => {
    expect(NETFLOW_NETWORKS).toContain("solana");
    expect(NETFLOW_NETWORKS).toContain("ethereum");
  });
});
