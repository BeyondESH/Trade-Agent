// @vitest-environment jsdom

import type { Datafeed, Period, SymbolInfo } from "@klinecharts/pro";
import { render } from "@testing-library/react";
import { act, createRef, StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KLineChartProView, type KLineChartProHandle } from "./KLineChartProView";

// Mock the vendor KLineChartPro so we can assert instance creation count and
// simulate the chart without a real canvas.
let mockInstances: Array<{ opts: unknown; destroyed: boolean }> = [];

const chartApi = vi.hoisted(() => ({
  scrollToRealTime: vi.fn(),
  getDataList: () => [],
  getDom: () => null,
}));

vi.mock("@klinecharts/pro", () => {
  class MockKLineChartPro {
    opts: unknown;
    destroyed = false;
    constructor(opts: unknown) {
      this.opts = opts;
      mockInstances.push(this);
    }
    getChart() {
      return chartApi;
    }
    setTheme() {}
    setLocale() {}
    setSymbol() {}
    setPeriod() {}
    getSymbol() {
      return undefined;
    }
    getPeriod() {
      return undefined;
    }
  }
  return { KLineChartPro: MockKLineChartPro };
});

const SYMBOL: SymbolInfo = { ticker: "BTCUSDT", market: "USDT-FUTURES" };
const PERIOD: Period = { multiplier: 1, timespan: "hour", text: "1h" };

function makeDatafeed(): Datafeed {
  return {
    searchSymbols: vi.fn().mockResolvedValue([]),
    getHistoryKLineData: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  } as unknown as Datafeed;
}

function renderInStrictMode(datafeed: Datafeed) {
  const { unmount } = render(
    <StrictMode>
      <KLineChartProView symbol={SYMBOL} period={PERIOD} datafeed={datafeed} />
    </StrictMode>,
  );
  return { unmount };
}

beforeEach(() => {
  mockInstances = [];
  vi.clearAllMocks();
});

describe("KLineChartProView mount lifecycle under StrictMode", () => {
  it("creates exactly one chart instance under StrictMode double-mount", async () => {
    const datafeed = makeDatafeed();
    const { unmount } = renderInStrictMode(datafeed);
    // Effects run synchronously in StrictMode double-mount; the second mount
    // must reuse the first instance instead of creating another.
    expect(mockInstances).toHaveLength(1);
    await act(async () => {
      unmount();
    });
  });

  it("reuses the instance and does not create a duplicate after remount within the same lifecycle", async () => {
    const datafeed = makeDatafeed();
    const { unmount } = renderInStrictMode(datafeed);
    expect(mockInstances).toHaveLength(1);
    await act(async () => {
      unmount();
    });
  });

  it("releases the datafeed subscription on genuine unmount", async () => {
    const datafeed = makeDatafeed();
    const { unmount } = renderInStrictMode(datafeed);
    const unsubscribe = datafeed.unsubscribe as ReturnType<typeof vi.fn>;
    await act(async () => {
      unmount();
      // allow the scheduled (setTimeout 0) disposal to run
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(unsubscribe).toHaveBeenCalledWith(SYMBOL, PERIOD);
  });

  it("allows a clean rebuild after unmount", async () => {
    const datafeed = makeDatafeed();
    let unmount1: () => void;
    await act(async () => {
      const r1 = renderInStrictMode(datafeed);
      unmount1 = r1.unmount;
    });
    expect(mockInstances).toHaveLength(1);
    await act(async () => {
      unmount1!();
      await new Promise((r) => setTimeout(r, 10));
    });
    // A fresh mount (e.g. remounting the component) creates a new instance.
    let unmount2: () => void;
    await act(async () => {
      const r2 = renderInStrictMode(makeDatafeed());
      unmount2 = r2.unmount;
    });
    expect(mockInstances).toHaveLength(2);
    await act(async () => {
      unmount2!();
    });
  });

  it("exposes a read-only diagnostic handle on window when the chart is ready", async () => {
    const datafeed = makeDatafeed();
    const { unmount } = renderInStrictMode(datafeed);
    const handle = (window as unknown as { __kline_chart__?: unknown }).__kline_chart__;
    // The vendor mock's getChart() returns an object exposing getDataList.
    expect(handle).toBeTruthy();
    expect(typeof (handle as { getDataList?: unknown }).getDataList).toBe("function");
    await act(async () => {
      unmount();
    });
  });
});

describe("KLineChartProView pro-chrome bridge", () => {
  function renderWithRef() {
    const ref = createRef<KLineChartProHandle>();
    const { unmount } = render(
      <KLineChartProView ref={ref} symbol={SYMBOL} period={PERIOD} datafeed={makeDatafeed()} />,
    );
    return { ref, unmount };
  }

  /** Append a fake native period bar with the 5 tool buttons, in vendor order. */
  function seedPeriodBar(root: HTMLElement): HTMLElement[] {
    const bar = document.createElement("div");
    bar.className = "klinecharts-pro-period-bar";
    const tools: HTMLElement[] = [];
    for (let i = 0; i < 5; i++) {
      const btn = document.createElement("div");
      btn.className = "item tools";
      bar.appendChild(btn);
      tools.push(btn);
    }
    root.appendChild(bar);
    return tools;
  }

  it("openIndicatorPicker clicks the native indicator chrome button", () => {
    const { ref, unmount } = renderWithRef();
    const tools = seedPeriodBar(ref.current!.getRoot()!);
    const clicks: number[] = [];
    tools.forEach((el, i) => {
      el.addEventListener("click", () => clicks.push(i));
    });
    act(() => ref.current!.openIndicatorPicker());
    expect(clicks).toEqual([0]);
    unmount();
  });

  it("openSettings clicks the native settings chrome button", () => {
    const { ref, unmount } = renderWithRef();
    const tools = seedPeriodBar(ref.current!.getRoot()!);
    const clicks: number[] = [];
    tools.forEach((el, i) => {
      el.addEventListener("click", () => clicks.push(i));
    });
    act(() => ref.current!.openSettings());
    expect(clicks).toEqual([2]);
    unmount();
  });

  it("resetView re-anchors the chart to real time", () => {
    const { ref, unmount } = renderWithRef();
    chartApi.scrollToRealTime.mockClear();
    act(() => ref.current!.resetView());
    expect(chartApi.scrollToRealTime).toHaveBeenCalledTimes(1);
    unmount();
  });
});
