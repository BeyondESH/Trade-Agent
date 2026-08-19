import { describe, expect, it, vi } from "vitest";
import {
  AutoLayerController,
  PRICE_LINE_GROUP_ID,
  alertLinesToDraw,
  isInsidePane,
  pixelToPrice,
  syncPriceLineOverlays,
} from "./chartController";

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

function fakeRect(rect: Partial<DOMRect> = {}) {
  return {
    left: rect.left ?? 0,
    top: rect.top ?? 0,
    right: rect.right ?? 800,
    bottom: rect.bottom ?? 600,
  } as DOMRect;
}

function fakePriceWidget() {
  return {
    getDom: vi.fn(),
    convertFromPixel: vi.fn(),
    createOverlay: vi.fn(),
    removeOverlay: vi.fn(),
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

describe("syncPriceLineOverlays", () => {
  const lines = [
    { alertId: "a1", price: 100, color: "#ff9800" },
    { alertId: "a2", price: 90, color: "#787b86" },
  ];

  it("clears the group and redraws one overlay per line with groupId + alertId", () => {
    const widget = fakePriceWidget();
    syncPriceLineOverlays(widget as never, lines);
    expect(widget.removeOverlay).toHaveBeenCalledWith({ groupId: PRICE_LINE_GROUP_ID });
    expect(widget.createOverlay).toHaveBeenCalledTimes(2);
    const first = widget.createOverlay.mock.calls[0][0];
    expect(first).toMatchObject({
      name: "priceLine",
      groupId: PRICE_LINE_GROUP_ID,
      points: [{ value: 100 }],
      extendData: { alertId: "a1" },
    });
  });

  it("wires onClick to fire with the alertId", () => {
    const widget = fakePriceWidget();
    const onClick = vi.fn();
    syncPriceLineOverlays(widget as never, lines, { onClick });
    const create = widget.createOverlay.mock.calls[0][0];
    const result = create.onClick({ overlay: { id: "ov-1" } });
    expect(onClick).toHaveBeenCalledWith("a1");
    expect(result).toBe(true);
  });

  it("wires onPressedMoveEnd to fire with the dragged price", () => {
    const widget = fakePriceWidget();
    const onDragEnd = vi.fn();
    syncPriceLineOverlays(widget as never, lines, { onDragEnd });
    const create = widget.createOverlay.mock.calls[0][0];
    create.onPressedMoveEnd({ overlay: { points: [{ value: 123.5 }] } });
    expect(onDragEnd).toHaveBeenCalledWith("a1", 123.5);
  });

  it("ignores a null widget", () => {
    expect(() => syncPriceLineOverlays(null, lines)).not.toThrow();
  });
});

describe("alertLinesToDraw", () => {
  const alerts = [
    { id: "a1", symbol: "BTCUSDT", condition: "above" as const, threshold: 100, enabled: true, triggered: false, createdAt: 1 },
    { id: "a2", symbol: "BTCUSDT", condition: "below" as const, threshold: 90, enabled: false, triggered: false, createdAt: 1 },
    { id: "a3", symbol: "ETHUSDT", condition: "above" as const, threshold: 200, enabled: true, triggered: false, createdAt: 1 },
  ];

  it("only includes the current symbol and derives semantic colors", () => {
    const dark = alertLinesToDraw(alerts, "BTCUSDT", "dark");
    expect(dark.map((l) => l.alertId)).toEqual(["a1", "a2"]);
    expect(dark[0].color).toBe("#ff9800");
    expect(dark[1].color).toBe("#787b86");
    const light = alertLinesToDraw(alerts, "BTCUSDT", "light");
    expect(light[1].color).toBe("#5d606b");
  });

  it("honors a persisted custom color", () => {
    const withColor = [{ ...alerts[0], color: "#123456" }];
    expect(alertLinesToDraw(withColor, "BTCUSDT", "dark")[0].color).toBe("#123456");
  });
});

describe("pixelToPrice / isInsidePane", () => {
  it("converts a client position to a price on the candle pane", () => {
    const widget = fakePriceWidget();
    widget.getDom.mockImplementation((paneId?: string) =>
      paneId === undefined
        ? { getBoundingClientRect: () => fakeRect() }
        : { getBoundingClientRect: () => fakeRect() },
    );
    widget.convertFromPixel.mockReturnValue({ value: 95000 });
    expect(pixelToPrice(widget as never, 400, 300)).toBe(95000);
    expect(widget.convertFromPixel).toHaveBeenCalledWith(
      [{ x: 400, y: 300 }],
      { paneId: "candle_pane", absolute: true },
    );
  });

  it("returns null when the chart, root dom, or price is missing", () => {
    expect(pixelToPrice(null, 0, 0)).toBeNull();
    const noRoot = fakePriceWidget();
    noRoot.getDom.mockReturnValue(null);
    expect(pixelToPrice(noRoot as never, 0, 0)).toBeNull();
    const noValue = fakePriceWidget();
    noValue.getDom.mockReturnValue({ getBoundingClientRect: () => fakeRect() });
    noValue.convertFromPixel.mockReturnValue({});
    expect(pixelToPrice(noValue as never, 0, 0)).toBeNull();
  });

  it("hit-tests a pane by its main DOM rect", () => {
    const widget = fakePriceWidget();
    widget.getDom.mockReturnValue({ getBoundingClientRect: () => fakeRect({ left: 10, top: 20, right: 810, bottom: 620 }) });
    expect(isInsidePane(widget as never, "candle_pane", 400, 300)).toBe(true);
    expect(isInsidePane(widget as never, "candle_pane", 5, 300)).toBe(false);
    expect(isInsidePane(null, "candle_pane", 400, 300)).toBe(false);
    widget.getDom.mockReturnValue(null);
    expect(isInsidePane(widget as never, "candle_pane", 400, 300)).toBe(false);
  });
});
