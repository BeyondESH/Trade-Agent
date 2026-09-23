// @vitest-environment jsdom

import type { Period, SymbolInfo as ProSymbolInfo } from "@klinecharts/pro";
import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAlert, loadAlerts } from "../../lib/alertsStore";
import type { SymbolInfo } from "../../types/trading";
import { NativeChart } from "./NativeChart";

const renderCalls: Array<{ symbol: ProSymbolInfo; period: Period }> = [];
let capturedOnSymbolChange: ((s: ProSymbolInfo) => void) | undefined;
let capturedOnPeriodChange: ((p: Period) => void) | undefined;
let capturedOnReady: ((c: never) => void) | undefined;

const mocks = vi.hoisted(() => {
  const chart = {
    getDom: vi.fn(),
    convertFromPixel: vi.fn(),
    createOverlay: vi.fn(),
    removeOverlay: vi.fn(),
  };
  const proApi = {
    openIndicatorPicker: vi.fn(),
    openSettings: vi.fn(),
    resetView: vi.fn(),
  };
  return { chart, proApi, rect: { left: 0, top: 0, right: 1000, bottom: 600 } };
});

vi.mock("./KLineChartProView", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  const KLineChartProView = forwardRef<
    { openIndicatorPicker: () => void; openSettings: () => void; resetView: () => void },
    {
      symbol: ProSymbolInfo;
      period: Period;
      onSymbolChange?: (s: ProSymbolInfo) => void;
      onPeriodChange?: (p: Period) => void;
      onReady?: (c: never) => void;
    }
  >((props, ref) => {
    renderCalls.push({ symbol: props.symbol, period: props.period });
    capturedOnSymbolChange = props.onSymbolChange;
    capturedOnPeriodChange = props.onPeriodChange;
    capturedOnReady = props.onReady;
    useImperativeHandle(ref, () => mocks.proApi);
    return (
      <div>
        <div data-testid="klinepro-toolbar" />
        <canvas data-testid="klinepro-canvas" />
      </div>
    );
  });
  return {
    NATIVE_PERIODS: [
      { multiplier: 1, timespan: "hour", text: "1h" },
      { multiplier: 4, timespan: "hour", text: "4h" },
    ],
    KLineChartProView,
  };
});

function makeSymbol(id: string): SymbolInfo {
  return {
    id,
    ticker: id,
    name: id,
    exchange: "USDT-FUTURES",
    category: "crypto",
    price: 1,
    change24h: 0,
    change24hPercent: 0,
    high24h: 1,
    low24h: 1,
    volume24h: "-",
    digits: 2,
    baseAsset: id,
    quoteAsset: "USDT",
    description: "",
  };
}

beforeEach(() => {
  localStorage.clear();
  renderCalls.length = 0;
  capturedOnSymbolChange = undefined;
  capturedOnPeriodChange = undefined;
  capturedOnReady = undefined;
  mocks.chart.getDom.mockReset();
  mocks.chart.convertFromPixel.mockReset();
  mocks.chart.createOverlay.mockReset();
  mocks.chart.removeOverlay.mockReset();
  mocks.chart.getDom.mockReturnValue({
    getBoundingClientRect: () => mocks.rect,
  });
  mocks.chart.convertFromPixel.mockReturnValue({ value: 95000 });
  mocks.proApi.openIndicatorPicker.mockReset();
  mocks.proApi.openSettings.mockReset();
  mocks.proApi.resetView.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

function renderChart(extraProps: Partial<React.ComponentProps<typeof NativeChart>> = {}) {
  const utils = render(
    <NativeChart symbol={makeSymbol("BTCUSDT")} timeframe="1h" theme="dark" {...extraProps} />,
  );
  act(() => {
    capturedOnReady?.(mocks.chart as never);
  });
  return utils;
}

describe("NativeChart single-chart wrapper", () => {
  it("renders one native chart with the pro symbol/period", () => {
    const { getByTestId } = render(
      <NativeChart symbol={makeSymbol("BTCUSDT")} timeframe="1h" theme="dark" />,
    );
    expect(getByTestId("klinepro-canvas")).toBeTruthy();
    const last = renderCalls[renderCalls.length - 1];
    expect(last.symbol.ticker).toBe("BTCUSDT");
    expect(last.period.text).toBe("1h");
  });

  it("keeps the pro symbol reference stable across unrelated re-renders", () => {
    const { rerender } = render(
      <NativeChart symbol={makeSymbol("ETHUSDT")} timeframe="1h" theme="dark" />,
    );
    const first = renderCalls[renderCalls.length - 1].symbol;
    rerender(<NativeChart symbol={makeSymbol("ETHUSDT")} timeframe="1h" theme="light" />);
    const second = renderCalls[renderCalls.length - 1].symbol;
    expect(second).toBe(first);
  });

  it("surfaces native symbol/period changes via the callbacks", () => {
    const onSymbolChange = vi.fn();
    const onPeriodChange = vi.fn();
    render(
      <NativeChart
        symbol={makeSymbol("BTCUSDT")}
        timeframe="1h"
        theme="dark"
        onSymbolChange={onSymbolChange}
        onPeriodChange={onPeriodChange}
      />,
    );
    expect(capturedOnSymbolChange).toBeDefined();
    expect(capturedOnPeriodChange).toBeDefined();
    capturedOnSymbolChange!({ ticker: "SOLUSDT", market: "USDT-FUTURES" });
    expect(onSymbolChange).toHaveBeenCalledWith({
      ticker: "SOLUSDT",
      market: "USDT-FUTURES",
    });
    capturedOnPeriodChange!({ multiplier: 4, timespan: "hour", text: "4h" });
    expect(onPeriodChange).toHaveBeenCalledWith({
      multiplier: 4,
      timespan: "hour",
      text: "4h",
    });
  });
});

describe("NativeChart price-line context menu", () => {
  it("opens a menu with the converted price when right-clicking the candle canvas", () => {
    const { getByTestId, queryByTestId } = renderChart();
    fireEvent.contextMenu(getByTestId("klinepro-canvas"), {
      clientX: 500,
      clientY: 300,
    });
    const menu = queryByTestId("chart-context-menu");
    expect(menu).toBeTruthy();
    expect(menu!.textContent).toContain("95000");
    expect(menu!.textContent).toContain("BTCUSDT");
  });

  it("does not open the menu when right-clicking a non-canvas (pro toolbar) area", () => {
    const { getByTestId, queryByTestId } = renderChart();
    fireEvent.contextMenu(getByTestId("klinepro-toolbar"), {
      clientX: 500,
      clientY: 300,
    });
    expect(queryByTestId("chart-context-menu")).toBeNull();
  });

  it("does not open the menu when the pixel->price conversion fails", () => {
    mocks.chart.convertFromPixel.mockReturnValue({});
    const { getByTestId, queryByTestId } = renderChart();
    fireEvent.contextMenu(getByTestId("klinepro-canvas"), {
      clientX: 500,
      clientY: 300,
    });
    expect(queryByTestId("chart-context-menu")).toBeNull();
  });

  it("does not open the menu before the chart is ready", () => {
    const { getByTestId, queryByTestId } = render(
      <NativeChart symbol={makeSymbol("BTCUSDT")} timeframe="1h" theme="dark" />,
    );
    fireEvent.contextMenu(getByTestId("klinepro-canvas"), {
      clientX: 500,
      clientY: 300,
    });
    expect(queryByTestId("chart-context-menu")).toBeNull();
  });

  it("renders all five required menu items", () => {
    const { getByTestId } = renderChart();
    fireEvent.contextMenu(getByTestId("klinepro-canvas"), { clientX: 500, clientY: 300 });
    for (const id of [
      "menu-create-alert",
      "menu-add-indicator",
      "menu-copy-price",
      "menu-open-settings",
      "menu-reset-view",
    ]) {
      expect(getByTestId(id)).toBeTruthy();
    }
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(5);
  });

  it("adds an indicator through the pro handle", () => {
    const { getByTestId } = renderChart();
    fireEvent.contextMenu(getByTestId("klinepro-canvas"), { clientX: 500, clientY: 300 });
    fireEvent.click(getByTestId("menu-add-indicator"));
    expect(mocks.proApi.openIndicatorPicker).toHaveBeenCalledTimes(1);
    expect(queryMenu()).toBeNull();
  });

  it("opens settings and resets the view through the pro handle", () => {
    const { getByTestId } = renderChart();
    fireEvent.contextMenu(getByTestId("klinepro-canvas"), { clientX: 500, clientY: 300 });
    fireEvent.click(getByTestId("menu-open-settings"));
    expect(mocks.proApi.openSettings).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(getByTestId("klinepro-canvas"), { clientX: 500, clientY: 300 });
    fireEvent.click(getByTestId("menu-reset-view"));
    expect(mocks.proApi.resetView).toHaveBeenCalledTimes(1);
  });

  it("copies the cursor price to the clipboard and closes the menu", () => {
    const { getByTestId } = renderChart();
    fireEvent.contextMenu(getByTestId("klinepro-canvas"), { clientX: 500, clientY: 300 });
    fireEvent.click(getByTestId("menu-copy-price"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("95000");
    expect(queryMenu()).toBeNull();
  });

  it("forwards the alert action to onCreateAlertAt and closes the menu", () => {
    const onCreateAlertAt = vi.fn();
    const { getByTestId } = renderChart({ onCreateAlertAt });
    fireEvent.contextMenu(getByTestId("klinepro-canvas"), {
      clientX: 500,
      clientY: 300,
    });
    fireEvent.click(getByTestId("menu-create-alert"));
    expect(onCreateAlertAt).toHaveBeenCalledWith(95000);
    expect(queryMenu()).toBeNull();
  });

  it("closes the menu on Escape", () => {
    const { getByTestId } = renderChart();
    fireEvent.contextMenu(getByTestId("klinepro-canvas"), {
      clientX: 500,
      clientY: 300,
    });
    expect(queryMenu()).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(queryMenu()).toBeNull();
  });
});

describe("NativeChart price-line overlay interactions", () => {
  it("draws the current symbol's entities and opens settings on left-click", () => {
    const seeded = createAlert({
      symbol: "BTCUSDT",
      condition: "above",
      threshold: 90000,
      enabled: true,
    });
    localStorage.setItem("raibro.alerts", JSON.stringify([seeded]));
    const { getByTestId } = renderChart();
    expect(mocks.chart.createOverlay).toHaveBeenCalled();
    const create = mocks.chart.createOverlay.mock.calls.at(-1)?.[0];
    expect(create).toMatchObject({
      name: "priceLine",
      points: [{ value: 90000 }],
      extendData: { alertId: seeded.id },
    });
    act(() => {
      create.onClick({ overlay: { id: "ov-1" } });
    });
    expect(getByTestId("price-line-settings-modal")).toBeTruthy();
  });

  it("persists the threshold after dragging a line", () => {
    const seeded = createAlert({
      symbol: "BTCUSDT",
      condition: "above",
      threshold: 90000,
      enabled: false,
    });
    localStorage.setItem("raibro.alerts", JSON.stringify([seeded]));
    renderChart();
    const create = mocks.chart.createOverlay.mock.calls.at(-1)?.[0];
    act(() => {
      create.onPressedMoveEnd({ overlay: { points: [{ value: 96000 }] } });
    });
    expect(loadAlerts()[0].threshold).toBe(96000);
  });
});

function queryMenu() {
  return document.querySelector('[data-testid="chart-context-menu"]');
}
