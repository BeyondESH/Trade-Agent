// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chart } from "klinecharts";
import { ChartSyncBus } from "./chartSyncBus";
import { DrawSyncRegistry } from "./chartSyncActions";
import { setupCellChart } from "./cellChartSetup";

interface FakeChart extends Record<string, unknown> {
  createdOverlays: Array<Record<string, unknown>>;
  subs: Record<string, (data?: unknown) => void>;
}

function fakeChart(): Chart {
  const state: FakeChart = {
    createdOverlays: [],
    subs: {},
  };
  const chart = {
    setOffsetRightDistance: vi.fn(),
    getSize: () => ({ width: 1000, height: 600 }),
    createIndicator: vi.fn(() => "indicator"),
    overrideIndicator: vi.fn(),
    subscribeAction: vi.fn((type: string, fn: (data?: unknown) => void) => {
      state.subs[type] = fn;
    }),
    unsubscribeAction: vi.fn(),
    getDataList: () => [
      { timestamp: 1000, open: 1, high: 2, low: 0, close: 1, volume: 1 },
      { timestamp: 2000, open: 1, high: 2, low: 0, close: 2, volume: 1 },
    ],
    createOverlay: vi.fn((value: unknown) => {
      const v = value as Record<string, unknown>;
      state.createdOverlays.push(v);
      return `ovl_${state.createdOverlays.length}`;
    }),
  } as unknown as Chart;
  (chart as unknown as Record<string, unknown>).__state = state;
  return chart;
}

const getState = (chart: Chart): FakeChart =>
  (chart as unknown as Record<string, unknown>).__state as FakeChart;

describe("setupCellChart", () => {
  let bus: ChartSyncBus;
  let suppress: { current: number };
  let registry: DrawSyncRegistry;
  let cb: ReturnType<typeof makeCallbacks>;

  function makeCallbacks() {
    return {
      isPrimary: vi.fn(() => true),
      onSelect: vi.fn(),
      onVisibleRange: vi.fn(),
      getSymbolKey: vi.fn(() => "USDT-FUTURES:BTCUSDT"),
      getSeriesKey: vi.fn(() => "USDT-FUTURES/BTCUSDT/5m"),
      recordOverlay: vi.fn(),
      dropOverlay: vi.fn(),
    };
  }

  beforeEach(() => {
    vi.useRealTimers();
    bus = new ChartSyncBus();
    suppress = { current: 0 };
    registry = new DrawSyncRegistry();
    cb = makeCallbacks();
  });

  it("applies right padding and the VOL underlay on the candle pane", () => {
    const chart = fakeChart();
    setupCellChart(chart, 0, bus, suppress, registry, cb);
    expect((chart.setOffsetRightDistance as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(50); // 5% of 1000
    expect(chart.createIndicator).toHaveBeenCalledWith({ name: "VOL" }, true, { id: "candle_pane" });
    expect(chart.overrideIndicator).toHaveBeenCalled();
  });

  it("records overlay ids and wires selection only for the primary cell", () => {
    const chart = fakeChart();
    setupCellChart(chart, 0, bus, suppress, registry, cb);
    chart.createOverlay({ name: "segment" });
    expect(cb.recordOverlay).toHaveBeenCalledWith("ovl_1");
    const state = getState(chart);
    const create = state.createdOverlays[0];
    (create.onSelected as (e: unknown) => boolean)({ overlay: { id: "ov1" } });
    expect(cb.onSelect).toHaveBeenCalledWith("ov1");
    cb.isPrimary.mockReturnValue(false);
    (create.onSelected as (e: unknown) => boolean)({ overlay: { id: "ov2" } });
    expect(cb.onSelect).not.toHaveBeenCalledWith("ov2");
  });

  it("emits a draw-create sync event with data coordinates on draw end", () => {
    const chart = fakeChart();
    setupCellChart(chart, 0, bus, suppress, registry, cb);
    const received: unknown[] = [];
    bus.register(1, (e) => received.push(e));
    chart.createOverlay({ name: "segment" });
    const state = getState(chart);
    const create = state.createdOverlays[0];
    (create.onDrawEnd as (e: unknown) => boolean)({
      overlay: {
        id: "draw_1",
        name: "segment",
        points: [{ dataIndex: 0, value: 1 }, { dataIndex: 1, value: 2 }],
        styles: {},
      },
    });
    // rAF-throttled free path: draw events emit synchronously on the bus
    expect(received).toHaveLength(1);
    const e = received[0] as { kind: string; origin: number; payload: Record<string, unknown> };
    expect(e.kind).toBe("draw");
    expect(e.origin).toBe(0);
    expect(e.payload).toMatchObject({
      opId: "draw_1",
      op: "create",
      points: [
        { timestamp: 1000, value: 1 },
        { timestamp: 2000, value: 2 },
      ],
      sourceSeries: "USDT-FUTURES:BTCUSDT",
    });
  });

  it("does not emit draw removal while suppressed (programmatic cleanup)", () => {
    const chart = fakeChart();
    setupCellChart(chart, 0, bus, suppress, registry, cb);
    const received: unknown[] = [];
    bus.register(1, (e) => received.push(e));
    chart.createOverlay({ name: "segment" });
    const state = getState(chart);
    const create = state.createdOverlays[0];

    suppress.current = 1;
    (create.onRemoved as (e: unknown) => boolean)({ overlay: { id: "ov_x" } });
    expect(received).toHaveLength(0);

    suppress.current = 0;
    (create.onRemoved as (e: unknown) => boolean)({ overlay: { id: "ov_y" } });
    expect(received).toHaveLength(1);
    expect(cb.dropOverlay).toHaveBeenCalledWith("ov_y");
  });

  it("emits crosshair and range events, honoring the suppression guard", () => {
    vi.useFakeTimers();
    const chart = fakeChart();
    setupCellChart(chart, 0, bus, suppress, registry, cb);
    const state = getState(chart);
    const received: unknown[] = [];
    bus.register(1, (e) => received.push(e));

    state.subs.onCrosshairChange({ kLineData: { timestamp: 2000 } });
    vi.advanceTimersByTime(50);
    expect(received.some((e) => (e as { kind: string }).kind === "crosshair")).toBe(true);

    const before = received.length;
    suppress.current = 1;
    state.subs.onCrosshairChange({ kLineData: { timestamp: 1000 } });
    vi.advanceTimersByTime(50);
    expect(received.length).toBe(before);
  });

  it("notifies the primary-only visible-range callback", () => {
    const chart = fakeChart();
    setupCellChart(chart, 0, bus, suppress, registry, cb);
    const state = getState(chart);
    state.subs.onVisibleRangeChange({ from: 0, to: 1, realTo: 1 });
    expect(cb.onVisibleRange).toHaveBeenCalledWith({ from: 0, to: 1, realTo: 1 });
  });

  it("cleanup unsubscribes chart actions", () => {
    const chart = fakeChart();
    const { cleanup } = setupCellChart(chart, 0, bus, suppress, registry, cb);
    cleanup();
    expect(chart.unsubscribeAction).toHaveBeenCalled();
  });
});
