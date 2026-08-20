// @vitest-environment jsdom
import { StrictMode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import { KLineChartProView } from "./KLineChartProView";
import type { Period, SymbolInfo, Datafeed } from "@klinecharts/pro";

// Mock the vendor KLineChartPro so we can assert instance creation count and
// simulate the chart without a real canvas.
let mockInstances: Array<{ opts: unknown; destroyed: boolean }> = [];

vi.mock("@klinecharts/pro", () => {
  class MockKLineChartPro {
    opts: unknown;
    destroyed = false;
    constructor(opts: unknown) {
      this.opts = opts;
      mockInstances.push(this);
    }
    getChart() {
      return {
        getDataList: () => [],
        getDom: () => null,
      };
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
