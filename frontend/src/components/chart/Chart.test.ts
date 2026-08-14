// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeResponse, Candle, StructureResponse } from "../../api/types";
import Chart from "./Chart.vue";

const m = vi.hoisted(() => {
  const instances: any[] = [];
  return {
    instances,
    ChartController: class {
      constructor() {
        instances.push(this);
      }
      init = vi.fn();
      applyData = vi.fn();
      updateData = vi.fn();
      setIndicators = vi.fn();
      restoreOverlays = vi.fn();
      removeOverlaysByGroup = vi.fn();
      createOverlay = vi.fn();
      destroy = vi.fn();
    },
  };
});

vi.mock("../../lib/chartController", () => ({
  ChartController: m.ChartController,
}));

const CANDLES: Candle[] = [
  { open_time: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1 },
  { open_time: 2000, open: 100, high: 102, low: 100, close: 101, volume: 2 },
];

const ANALYZE: AnalyzeResponse = {
  price: 101,
  indicators: {},
  levels: [{ price: 100, kind: "support", strength: 5, sources: ["swing"] }],
};

const STRUCTURE: StructureResponse = {
  swings: [{ open_time: 1000, price: 100, kind: "low" }],
  trendlines: [{ kind: "support", slope: 0, intercept: 100, projection: 0 }],
  box: { lower: 99, upper: 102 },
  liquidity: [{ price: 100.5 }],
  order_blocks: {},
  bos_choch: [],
};

beforeEach(() => {
  m.instances.length = 0;
});

describe("Chart", () => {
  it("inits controller, applies data, indicators and auto overlays", async () => {
    const w = mount(Chart, {
      props: {
        candles: CANDLES,
        analyze: ANALYZE,
        structure: STRUCTURE,
        layers: { sr: true, structure: true, smc: false },
        indicators: [{ name: "MACD", pane: "sub" }],
      },
    });
    await flushPromises();
    const ctl = m.instances[0];
    expect(ctl.init).toHaveBeenCalledWith(expect.objectContaining({ container: expect.anything() }));
    expect(ctl.applyData).toHaveBeenCalledWith([
      expect.objectContaining({ timestamp: 1000, open: 100 }),
      expect.objectContaining({ timestamp: 2000, open: 100 }),
    ]);
    expect(ctl.setIndicators).toHaveBeenCalledWith([{ name: "MACD", pane: "sub" }]);
    expect(ctl.createOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "auto-sr", name: "priceLine" }),
    );
    expect(ctl.createOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "auto-structure", name: "segment" }),
    );
    expect(ctl.createOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: "auto-structure", name: "rect" }),
    );
    w.unmount();
    expect(ctl.destroy).toHaveBeenCalled();
  });

  it("updates the last candle incrementally via updateData", async () => {
    const w = mount(Chart, {
      props: {
        candles: CANDLES,
        analyze: null,
        structure: null,
        layers: { sr: false, structure: false, smc: false },
      },
    });
    await flushPromises();
    const ctl = m.instances[0];
    await w.setProps({
      lastCandle: { timestamp: 3000, open: 101, high: 103, low: 100, close: 102, volume: 1 },
    });
    await nextTick();
    expect(ctl.updateData).toHaveBeenCalledWith(
      expect.objectContaining({ timestamp: 3000, close: 102 }),
    );
    w.unmount();
  });

  it("restores persisted drawings on mount", async () => {
    const drawings = [
      { id: "d1", name: "segment", points: [{ timestamp: 1, value: 100 }] },
    ];
    const w = mount(Chart, {
      props: {
        candles: CANDLES,
        analyze: null,
        structure: null,
        layers: { sr: false, structure: false, smc: false },
        drawings,
      },
    });
    await flushPromises();
    const ctl = m.instances[0];
    expect(ctl.restoreOverlays).toHaveBeenCalledWith(drawings);
    w.unmount();
  });

  it("clears the chart when candles become empty (no stale data)", async () => {
    const w = mount(Chart, {
      props: {
        candles: CANDLES,
        analyze: null,
        structure: null,
        layers: { sr: false, structure: false, smc: false },
      },
    });
    await flushPromises();
    const ctl = m.instances[0];
    await w.setProps({ candles: [] });
    await nextTick();
    expect(ctl.applyData).toHaveBeenCalledWith([]);
    w.unmount();
  });
});
