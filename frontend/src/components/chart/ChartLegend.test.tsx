// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Chart, Indicator } from "klinecharts";
import { ChartLegend } from "./ChartLegend";

function makeIndicator(name: string, value: number, visible = true): Indicator {
  return {
    name,
    shortName: name,
    precision: 2,
    calcParams: [],
    shouldOhlc: false,
    shouldFormatBigNumber: false,
    visible,
    zLevel: 0,
    extendData: undefined,
    series: 0 as unknown as Indicator["series"],
    figures: [{ key: "ma" }],
    minValue: null,
    maxValue: null,
    styles: null,
    calc: () => [],
    regenerateFigures: null,
    createTooltipDataSource: null,
    draw: null,
    result: [{ ma: value }],
  };
}

const CANDLES = [
  { open_time: 1000, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
  { open_time: 2000, open: 105, high: 115, low: 100, close: 108, volume: 1200 },
];

function makeChart(indicators: Map<string, Map<string, Indicator>>): Chart {
  return {
    getIndicatorByPaneId: () => indicators,
    overrideIndicator: vi.fn(),
    removeIndicator: vi.fn(),
  } as unknown as Chart;
}

describe("ChartLegend", () => {
  it("renders symbol, period, exchange and OHLC with change", () => {
    const chart = makeChart(new Map());
    render(
      <ChartLegend chart={chart} candles={CANDLES} symbol="BTCUSDT" period="5m" exchange="USDT-FUTURES" />,
    );
    expect(screen.getByTestId("chart-legend").textContent).toContain("BTCUSDT");
    expect(screen.getByTestId("chart-legend").textContent).toContain("5m");
    expect(screen.getByTestId("chart-legend").textContent).toContain("108");
    expect(screen.getByTestId("chart-legend").textContent).toContain("8.00%");
  });

  it("lists indicators with their latest value and hover actions", () => {
    const indicators = new Map([
      ["candle_pane", new Map([["MA", makeIndicator("MA", 106.5, true)]])],
    ]);
    const chart = makeChart(indicators);
    render(
      <ChartLegend chart={chart} candles={CANDLES} symbol="BTCUSDT" period="5m" exchange="USDT-FUTURES" />,
    );
    const row = screen.getByTestId("legend-indicator-MA");
    expect(row.textContent).toContain("106.50");
    // hover disclosure: action buttons present on the row
    expect(row.querySelector("button")).not.toBeNull();
    fireEvent.click(row.querySelector("button") as HTMLButtonElement);
    expect((chart.overrideIndicator as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it("renders a placeholder when there are no candles", () => {
    const chart = makeChart(new Map());
    render(<ChartLegend chart={chart} candles={[]} symbol="BTCUSDT" period="5m" exchange="USDT-FUTURES" />);
    expect(screen.getByTestId("chart-legend").textContent).toContain("--");
  });
});
