import { describe, expect, it, vi } from "vitest";
import { AutoLayerController } from "./chartController";

function fakeWidget() {
  return {
    applyNewData: vi.fn(),
    updateData: vi.fn(),
    createIndicator: vi.fn(),
    removeIndicator: vi.fn(),
    createOverlay: vi.fn(),
    removeOverlay: vi.fn(),
    getOverlayById: vi.fn(),
  };
}

describe("AutoLayerController", () => {
  it("applies full data and incremental updates", () => {
    const widget = fakeWidget();
    const c = new AutoLayerController();
    c.attach(widget as never);
    c.applyData([{ timestamp: 1, open: 1, high: 2, low: 0, close: 1 }]);
    c.updateData({ timestamp: 2, open: 1, high: 2, low: 1, close: 2 });
    expect(widget.applyNewData).toHaveBeenCalled();
    expect(widget.updateData).toHaveBeenCalled();
  });

  it("adds sub-pane and candle-stacked indicators", () => {
    const widget = fakeWidget();
    const c = new AutoLayerController();
    c.attach(widget as never);
    c.addIndicator({ name: "MACD", pane: "sub" });
    expect(widget.createIndicator).toHaveBeenCalledWith(
      { name: "MACD" },
      false,
      expect.objectContaining({ id: expect.stringContaining("indicator_pane_") }),
    );
    c.addIndicator({ name: "MA", pane: "candle" });
    expect(widget.createIndicator).toHaveBeenCalledWith({ name: "MA" }, true);
  });

  it("creates auto overlays and removes them by group", () => {
    const widget = fakeWidget();
    const c = new AutoLayerController();
    c.attach(widget as never);
    widget.createOverlay.mockReturnValueOnce("ov-1");
    c.createOverlay({ name: "priceLine", points: [{ value: 100 }], groupId: "auto-sr" });
    widget.getOverlayById.mockReturnValue({ name: "priceLine", groupId: "auto-sr", points: [] });
    c.removeOverlaysByGroup("auto-sr");
    expect(widget.removeOverlay).toHaveBeenCalledWith({ groupId: "auto-sr" });
  });

  it("ignores calls before attach", () => {
    const c = new AutoLayerController();
    expect(() => c.applyData([])).not.toThrow();
    expect(() => c.removeOverlaysByGroup("auto-sr")).not.toThrow();
  });

  it("detach clears tracked state", () => {
    const widget = fakeWidget();
    const c = new AutoLayerController();
    c.attach(widget as never);
    c.detach();
    expect(() => c.createOverlay({ name: "segment" })).not.toThrow();
  });
});
