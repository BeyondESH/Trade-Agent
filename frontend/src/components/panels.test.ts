// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Controls from "./panels/Controls.vue";
import OrderConfirmDialog from "./panels/OrderConfirmDialog.vue";
import StrategyEditor from "./panels/StrategyEditor.vue";

const m = vi.hoisted(() => ({
  getConfig: vi.fn(),
  putConfig: vi.fn(),
  control: vi.fn(),
  order: vi.fn(),
  orderConfirm: vi.fn(),
  portfolio: vi.fn(),
  journal: vi.fn(),
}));

vi.mock("../api/client", () => ({
  ApiError: class ApiError extends Error {
    status = 400;
  },
  api: m,
}));

const CFG = {
  provider: { kind: "rule", model: "", base_url: "", api_key: "", near_pct: 0.005,
              min_strength: 2, leverage: 100, category: "USDT-FUTURES" },
  risk: { margin_pct: 0.05, max_drawdown_pct: 0.15, max_leverage: 100, max_adds: 3,
          max_symbol_margin_pct: 0.05 },
  system_prompt: null,
  manual_rules: [],
};

const SERIES = { category: "USDT-FUTURES", symbol: "BTCUSDT", timeframe: "5m" };

beforeEach(() => {
  vi.clearAllMocks();
  m.getConfig.mockResolvedValue(structuredClone(CFG));
  m.putConfig.mockResolvedValue(structuredClone(CFG));
  m.control.mockResolvedValue({ kill_switch: true, live_enabled: false });
  m.order.mockResolvedValue({ token: "tok-123", preview: { margin: 50 } });
  m.orderConfirm.mockResolvedValue({ approved: true, filled: true, reason: "ok", live: false });
  m.portfolio.mockResolvedValue({ equity: 1000, peak_equity: 1000, positions: {} });
  m.journal.mockResolvedValue({ trades: [] });
});

describe("StrategyEditor", () => {
  it("loads config then saves via PUT /config", async () => {
    const w = mount(StrategyEditor);
    await flushPromises();
    const marginInput = w
      .findAll('input[type="number"]')
      .find((i) => (i.element as HTMLInputElement).value === "0.05")!;
    expect((marginInput.element as HTMLInputElement).value).toBe("0.05");
    await marginInput.setValue("0.03");
    await w.findAll("button").find((b) => b.text() === "Save")!.trigger("click");
    await flushPromises();
    expect(m.putConfig).toHaveBeenCalled();
    expect(m.putConfig.mock.calls[0][0].risk.margin_pct).toBe(0.03);
  });
});

describe("OrderConfirmDialog", () => {
  it("two-step: submit gets token, confirm executes with that token", async () => {
    const w = mount(OrderConfirmDialog, { props: { series: SERIES } });
    await w.findAll("button").find((b) => b.text() === "Submit")!.trigger("click");
    await flushPromises();
    expect(m.order).toHaveBeenCalled();
    await w.findAll("button").find((b) => b.text() === "Confirm")!.trigger("click");
    await flushPromises();
    expect(m.orderConfirm).toHaveBeenCalledWith("tok-123");
  });
});

describe("Controls", () => {
  it("toggling kill-switch calls PUT /control", async () => {
    const w = mount(Controls);
    await w.findAll('input[type="checkbox"]')[0].setValue(true);
    await flushPromises();
    expect(m.control).toHaveBeenCalledWith({ kill_switch: true });
  });
});
