// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  candles: vi.fn(),
  candlesRecent: vi.fn(),
  analyze: vi.fn(),
  structure: vi.fn(),
  chartConfig: vi.fn(),
  saveChartConfig: vi.fn(),
  portfolio: vi.fn(),
  journal: vi.fn(),
  getConfig: vi.fn(),
  control: vi.fn(),
}));

vi.mock("./api/client", () => ({
  ApiError: class ApiError extends Error {},
  api: m,
}));
// Chart needs a real canvas; stub it for the layout test.
vi.mock("./components/chart/Chart.vue", () => ({
  default: { template: '<div data-testid="chart" />' },
}));
// Avoid opening a real WebSocket in jsdom.
vi.mock("./composables/useSnapshot", () => ({ useSnapshot: () => ({ value: null }) }));

import App from "./App.vue";

const CFG = {
  provider: { kind: "rule", model: "", base_url: "", api_key: "", near_pct: 0.005,
              min_strength: 2, leverage: 100, category: "USDT-FUTURES" },
  risk: { margin_pct: 0.05, max_drawdown_pct: 0.15, max_leverage: 100, max_adds: 3,
          max_symbol_margin_pct: 0.05 },
  system_prompt: null,
  manual_rules: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.candles.mockResolvedValue({ candles: [], count: 0 });
  m.candlesRecent.mockResolvedValue({ candles: [], count: 0 });
  m.analyze.mockResolvedValue({ price: 100, indicators: {}, levels: [] });
  m.structure.mockResolvedValue({
    swings: [], trendlines: [], box: null, liquidity: [], order_blocks: {}, bos_choch: [],
  });
  m.chartConfig.mockResolvedValue({
    indicators: [], drawings: [], layers: { sr: true, structure: true, smc: false },
  });
  m.saveChartConfig.mockResolvedValue({});
  m.portfolio.mockResolvedValue({ equity: 1000, peak_equity: 1000, positions: {} });
  m.journal.mockResolvedValue({ trades: [] });
  m.getConfig.mockResolvedValue(structuredClone(CFG));
  m.control.mockResolvedValue({ kill_switch: false, live_enabled: false });
});

describe("App terminal layout", () => {
  it("renders market list with symbols", async () => {
    const w = mount(App);
    await flushPromises();
    // BTCUSDT appears in both header and market list; ETH/SOL only in the list.
    expect(w.text().split("BTCUSDT").length - 1).toBeGreaterThanOrEqual(1);
    expect(w.text()).toContain("ETHUSDT");
    expect(w.text()).toContain("SOLUSDT");
    w.unmount();
  });

  it("selecting a symbol updates the header (linkage)", async () => {
    const w = mount(App);
    await flushPromises();
    // initially ETHUSDT only in market list (header shows BTCUSDT)
    expect(w.text().split("ETHUSDT").length - 1).toBe(1);
    await w.findAll("button").find((b) => b.text().includes("ETHUSDT"))!.trigger("click");
    await flushPromises();
    // now header also shows ETHUSDT -> two occurrences
    expect(w.text().split("ETHUSDT").length - 1).toBe(2);
    w.unmount();
  });

  it("switching to Strategy tab shows the editor", async () => {
    const w = mount(App);
    await flushPromises();
    await w.findAll("button").find((b) => b.text() === "Strategy")!.trigger("click");
    await flushPromises();
    // provider kind loaded via getConfig
    expect(w.text()).toContain("provider kind");
    expect(m.getConfig).toHaveBeenCalled();
    w.unmount();
  });

  it("falls back to live recent candles when stored data is empty", async () => {
    m.candles.mockResolvedValue({ candles: [], count: 0 });
    m.candlesRecent.mockResolvedValue({
      candles: [{ open_time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
      count: 1,
    });
    const w = mount(App);
    await flushPromises();
    expect(m.candlesRecent).toHaveBeenCalled();
    w.unmount();
  });

  it("does not fall back when stored data exists", async () => {
    m.candles.mockResolvedValue({
      candles: [{ open_time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
      count: 1,
    });
    const w = mount(App);
    await flushPromises();
    expect(m.candlesRecent).not.toHaveBeenCalled();
    w.unmount();
  });
});
