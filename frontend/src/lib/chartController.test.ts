// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Chart, OverlayCreate } from "klinecharts";

const m = vi.hoisted(() => {
  const chart = {
    applyNewData: vi.fn(),
    updateData: vi.fn(),
    createIndicator: vi.fn(),
    removeIndicator: vi.fn(),
    createOverlay: vi.fn(),
    removeOverlay: vi.fn(),
    getOverlayById: vi.fn(),
    subscribeAction: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    chart,
    init: vi.fn(() => chart as unknown as Chart),
    dispose: vi.fn(),
    ActionType: { OnCandleBarClick: "onCandleBarClick" },
  };
});

vi.mock("klinecharts", () => ({
  ActionType: m.ActionType,
  init: m.init,
  dispose: m.dispose,
}));

import { ChartController } from "./chartController";

describe("ChartController", () => {
  it("init wires click subscription", () => {
    const c = new ChartController();
    const click = vi.fn();
    c.init({ container: document.createElement("div"), onDataPointClick: click });
    expect(m.init).toHaveBeenCalledTimes(1);
    expect(m.chart.subscribeAction).toHaveBeenCalledWith(
      "onCandleBarClick",
      expect.any(Function),
    );
  });

  it("applies full data and incremental updates", () => {
    const c = new ChartController();
    c.init({ container: document.createElement("div") });
    c.applyData([{ timestamp: 1, open: 1, high: 2, low: 0, close: 1 }]);
    expect(m.chart.applyNewData).toHaveBeenCalled();
    c.updateData({ timestamp: 2, open: 1, high: 2, low: 1, close: 2 });
    expect(m.chart.updateData).toHaveBeenCalled();
  });

  it("adds sub-pane and candle-stacked indicators", () => {
    const c = new ChartController();
    c.init({ container: document.createElement("div") });
    m.chart.createIndicator.mockReturnValueOnce("indicator_pane_0");
    c.addIndicator({ name: "MACD", pane: "sub" });
    expect(m.chart.createIndicator).toHaveBeenCalledWith(
      { name: "MACD" },
      false,
      expect.objectContaining({ id: "indicator_pane_0" }),
    );
    c.addIndicator({ name: "MA", pane: "candle" });
    expect(m.chart.createIndicator).toHaveBeenCalledWith({ name: "MA" }, true);
  });

  it("setIndicators resets existing panes then applies new set", () => {
    const c = new ChartController();
    c.init({ container: document.createElement("div") });
    m.chart.createIndicator.mockReturnValue("pane-1");
    c.setIndicators([{ name: "MACD", pane: "sub" }, { name: "VOL", pane: "sub" }]);
    expect(m.chart.removeIndicator).toHaveBeenCalledWith("candle_pane");
    c.setIndicators([{ name: "RSI", pane: "sub" }]);
    expect(m.chart.removeIndicator).toHaveBeenCalledWith("pane-1");
    expect(m.chart.createIndicator).toHaveBeenCalledWith(
      { name: "RSI" },
      false,
      expect.objectContaining({ id: expect.stringContaining("indicator_pane_") }),
    );
  });

  it("tracks and serializes overlays without dataIndex", () => {
    const c = new ChartController();
    c.init({ container: document.createElement("div") });
    m.chart.createOverlay.mockReturnValueOnce("ov-1");
    c.createOverlay({ name: "segment", points: [{ timestamp: 1, value: 100 }] });
    m.chart.getOverlayById.mockReturnValue({
      name: "segment",
      groupId: "auto-sr",
      points: [{ dataIndex: 0, timestamp: 1, value: 100 }],
      styles: { line: { color: "#26a69a" } },
    });
    const overlays = c.getOverlays();
    expect(overlays).toEqual([
      { id: "ov-1", name: "segment", groupId: "auto-sr",
        points: [{ timestamp: 1, value: 100 }], styles: { line: { color: "#26a69a" } } },
    ]);
  });

  it("restoreOverlays creates overlays and tracks ids", () => {
    const c = new ChartController();
    c.init({ container: document.createElement("div") });
    m.chart.createOverlay.mockReturnValueOnce("ov-r");
    c.restoreOverlays([{ name: "segment", points: [{ timestamp: 1, value: 100 }] }]);
    expect(m.chart.createOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ name: "segment" }),
    );
    m.chart.getOverlayById.mockReturnValue({ name: "segment", points: [], styles: null });
    expect(c.getOverlays()).toHaveLength(1);
  });

  it("removes by group and clears tracking", () => {
    const c = new ChartController();
    c.init({ container: document.createElement("div") });
    m.chart.createOverlay.mockReturnValueOnce("ov-1");
    c.createOverlay({ name: "segment" });
    m.chart.getOverlayById.mockReturnValue({ name: "segment", groupId: "auto-sr", points: [] });
    c.removeOverlaysByGroup("auto-sr");
    expect(m.chart.removeOverlay).toHaveBeenCalledWith({ groupId: "auto-sr" });
    expect(c.getOverlays()).toEqual([]);
  });

  it("destroy disposes the chart", () => {
    const c = new ChartController();
    c.init({ container: document.createElement("div") });
    c.destroy();
    expect(m.dispose).toHaveBeenCalledWith(m.chart);
  });
});
