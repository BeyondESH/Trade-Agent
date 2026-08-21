// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SignalKLineChart } from "./SignalKLineChart";
import type { Chart } from "klinecharts";

const apiMock = vi.hoisted(() => ({ candles: vi.fn() }));
vi.mock("../../../api/client", () => ({ api: apiMock }));

const chartMock = vi.hoisted(() => ({
  removeOverlay: vi.fn(),
  createOverlay: vi.fn(),
}));

vi.mock("../../chart/KLineChartProView", () => ({
  KLineChartProView: ({
    onReady,
  }: {
    onReady?: (chart: Chart | null) => void;
  }) => {
    // Signal readiness once on mount so the effect can run.
    onReady?.(chartMock as unknown as Chart);
    return <div data-testid="kline-chart" />;
  },
}));

const series = { category: "USDT-FUTURES", symbol: "BTCUSDT", timeframe: "1h" };

const result = {
  total_return: 0.04,
  series: {
    open_time: [1700000000000, 1700000360000, 1700000720000],
    equity: [1, 1.01, 1.02],
    drawdown: [0, 0, 0],
    signal: [1, -1, 0],
    proba: [0.7, 0.6, 0.5],
  },
};

describe("SignalKLineChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.candles.mockResolvedValue({
      candles: [
        { open_time: 1700000000000, open: 1, high: 1, low: 1, close: 100, volume: 1 },
        { open_time: 1700000360000, open: 1, high: 1, low: 1, close: 101, volume: 1 },
        { open_time: 1700000720000, open: 1, high: 1, low: 1, close: 102, volume: 1 },
      ],
      count: 3,
    });
  });

  it("renders the chart panel", () => {
    render(<SignalKLineChart symbol="BTCUSDT" timeframe="1h" series={series} result={null} theme="dark" />);
    expect(screen.getByText("信号 K 线")).toBeInTheDocument();
    expect(screen.getByTestId("kline-chart")).toBeInTheDocument();
  });

  it("loads candles and draws overlays when a result has signals", async () => {
    render(<SignalKLineChart symbol="BTCUSDT" timeframe="1h" series={series} result={result as never} theme="dark" />);
    await waitFor(() => expect(apiMock.candles).toHaveBeenCalled());
    await waitFor(() => expect(chartMock.removeOverlay).toHaveBeenCalledWith({ groupId: "backtest-signals" }));
    await waitFor(() => expect(chartMock.createOverlay).toHaveBeenCalled());
    const overlays = chartMock.createOverlay.mock.calls[0][0] as unknown[];
    expect(overlays).toHaveLength(2); // one long + one short
  });

  it("clears overlays but skips drawing when signal lane is empty", async () => {
    const empty = { ...result, series: { ...result.series, signal: [0, 0, 0] } };
    render(<SignalKLineChart symbol="BTCUSDT" timeframe="1h" series={series} result={empty as never} theme="dark" />);
    await waitFor(() => expect(chartMock.removeOverlay).toHaveBeenCalledWith({ groupId: "backtest-signals" }));
    expect(chartMock.createOverlay).not.toHaveBeenCalled();
  });
});
