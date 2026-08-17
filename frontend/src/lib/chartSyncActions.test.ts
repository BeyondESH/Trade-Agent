// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Chart } from "klinecharts";
import {
  DrawSyncRegistry,
  applyRemoteCrosshair,
  applyRemoteDraw,
  applyRemoteRange,
  countBarsBetween,
  guarded,
  nearestBarIndex,
  pointsToDataCoords,
  visibleTimestamps,
} from "./chartSyncActions";

const bars = [
  { timestamp: 1000, open: 1, high: 2, low: 0, close: 1, volume: 1 },
  { timestamp: 2000, open: 1, high: 2, low: 0, close: 2, volume: 1 },
  { timestamp: 3000, open: 2, high: 3, low: 1, close: 3, volume: 1 },
  { timestamp: 4000, open: 3, high: 4, low: 2, close: 4, volume: 1 },
];

function fakeChart(overrides: Partial<Chart> = {}): Chart {
  return {
    getDataList: () => bars,
    getVisibleRange: () => ({ from: 0, to: 3, realFrom: 0, realTo: 3 }),
    convertToPixel: () => [{ x: 50, y: 30 }],
    getDom: () => null,
    zoomAtTimestamp: vi.fn(),
    scrollToTimestamp: vi.fn(),
    createOverlay: vi.fn(() => "overlay_1"),
    overrideOverlay: vi.fn(),
    removeOverlay: vi.fn(),
    ...overrides,
  } as unknown as Chart;
}

describe("nearestBarIndex / countBarsBetween", () => {
  it("finds the nearest bar by timestamp", () => {
    expect(nearestBarIndex(bars, 1800)).toBe(1);
    expect(nearestBarIndex(bars, 100)).toBe(0);
    expect(nearestBarIndex(bars, 99999)).toBe(3);
    expect(nearestBarIndex([], 5)).toBe(-1);
  });

  it("counts bars spanning a timestamp range", () => {
    expect(countBarsBetween(bars, 1000, 4000)).toBe(4);
    // 2100 snaps to the 2000 bar, 2900 snaps to the 3000 bar -> 2 bars
    expect(countBarsBetween(bars, 2100, 2900)).toBe(2);
  });
});

describe("guarded suppression", () => {
  it("suppresses while running and releases after the scheduler tick", () => {
    const suppress = { current: 0 };
    const pending: Array<() => void> = [];
    guarded(suppress, () => {
      expect(suppress.current).toBe(1);
    }, (fn) => pending.push(fn));
    expect(suppress.current).toBe(1);
    pending.forEach((fn) => fn());
    expect(suppress.current).toBe(0);
  });

  it("releases even when the body throws", () => {
    const suppress = { current: 0 };
    const pending: Array<() => void> = [];
    expect(() =>
      guarded(suppress, () => {
        throw new Error("x");
      }, (fn) => pending.push(fn)),
    ).toThrow();
    expect(suppress.current).toBe(1);
    pending.forEach((fn) => fn());
    expect(suppress.current).toBe(0);
  });
});

describe("visibleTimestamps / applyRemoteRange", () => {
  it("maps the visible range to timestamps", () => {
    const chart = fakeChart({ getVisibleRange: () => ({ from: 1, to: 2, realFrom: 1, realTo: 2 }) } as Partial<Chart>);
    expect(visibleTimestamps(chart)).toEqual({ fromTs: 2000, toTs: 3000 });
  });

  it("zooms to match the bar span and aligns the left edge", () => {
    const zoom = vi.fn();
    const scroll = vi.fn();
    const chart = fakeChart({
      zoomAtTimestamp: zoom,
      scrollToTimestamp: scroll,
      getVisibleRange: () => ({ from: 0, to: 3, realFrom: 0, realTo: 3 }),
    } as Partial<Chart>);
    applyRemoteRange(chart, 1000, 2000);
    expect(zoom).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(1000);
  });

  it("skips the zoom when spans already match", () => {
    const zoom = vi.fn();
    const scroll = vi.fn();
    const chart = fakeChart({ zoomAtTimestamp: zoom, scrollToTimestamp: scroll } as Partial<Chart>);
    applyRemoteRange(chart, 1000, 4000);
    expect(zoom).not.toHaveBeenCalled();
    expect(scroll).toHaveBeenCalledWith(1000);
  });
});

describe("applyRemoteCrosshair", () => {
  it("dispatches a synthetic mousemove on the main pane at the bar's coordinate", () => {
    const dispatch = vi.fn();
    const dom = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 300 }),
      dispatchEvent: dispatch,
    };
    const chart = fakeChart({ getDom: () => dom as unknown as HTMLElement } as Partial<Chart>);
    const ok = applyRemoteCrosshair(chart, 2600);
    expect(ok).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const ev: MouseEvent = dispatch.mock.calls[0][0];
    expect(ev.type).toBe("mousemove");
    expect(ev.clientX).toBe(150); // rect.left + x(50)
  });

  it("returns false when the chart has no data", () => {
    const chart = fakeChart({ getDataList: () => [] } as Partial<Chart>);
    expect(applyRemoteCrosshair(chart, 1000)).toBe(false);
  });
});

describe("drawing sync registry + applyRemoteDraw", () => {
  it("creates, overrides and removes drawings by opId", () => {
    const create = vi.fn(() => "ovl_9");
    const override = vi.fn();
    const remove = vi.fn();
    const chart = fakeChart({ createOverlay: create, overrideOverlay: override, removeOverlay: remove } as Partial<Chart>);
    const reg = new DrawSyncRegistry();

    applyRemoteDraw(chart, reg, {
      opId: "op1",
      op: "create",
      name: "segment",
      points: [
        { timestamp: 1000, value: 1 },
        { timestamp: 2000, value: 2 },
      ],
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(reg.localIdFor("op1")).toBe("ovl_9");

    // duplicate create for the same opId is ignored
    applyRemoteDraw(chart, reg, { opId: "op1", op: "create", points: [] });
    expect(create).toHaveBeenCalledTimes(1);

    applyRemoteDraw(chart, reg, { opId: "op1", op: "override", points: [{ timestamp: 1000, value: 5 }] });
    expect(override).toHaveBeenCalledWith(expect.objectContaining({ id: "ovl_9" }));

    applyRemoteDraw(chart, reg, { opId: "op1", op: "remove" });
    expect(remove).toHaveBeenCalledWith({ id: "ovl_9" });
    expect(reg.localIdFor("op1")).toBeNull();
  });

  it("pointsToDataCoords resolves timestamp from dataIndex when missing", () => {
    const chart = fakeChart();
    const pts = pointsToDataCoords(chart, [{ dataIndex: 2, value: 3 }, { timestamp: 1000, value: 1 }]);
    expect(pts).toEqual([
      { timestamp: 3000, value: 3 },
      { timestamp: 1000, value: 1 },
    ]);
  });
});
