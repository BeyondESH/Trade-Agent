// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuantLabPanel } from "./QuantLabPanel";

const apiMock = vi.hoisted(() => ({
  getConfig: vi.fn(),
  putConfig: vi.fn(),
  backtest: vi.fn(),
  job: vi.fn(),
  backtestHistory: vi.fn(),
  backtestHistoryDetail: vi.fn(),
  backtestHistoryDelete: vi.fn(),
  candles: vi.fn(),
  sweep: vi.fn(),
  walkforward: vi.fn(),
  dlFeatures: vi.fn(),
}));

vi.mock("../../../api/client", () => ({ api: apiMock }));

vi.mock("./SignalKLineChart", () => ({
  SignalKLineChart: () => <div data-testid="signal-kline-chart" />,
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

const fakeResult = {
  total_return: 0.04,
  max_drawdown: -0.01,
  win_rate: 0.6,
  trades: 2,
  bars: 60,
  test_bars: 60,
  stats: { sharpe_ratio: 1.1, sortino_ratio: 0.9 },
  model_metrics: { roc_auc: 0.72, log_loss: 0.61 },
  trade_list: [
    {
      side: "long",
      entry_time: 1700000000000,
      entry_price: 100,
      exit_time: 1700003600000,
      exit_price: 105,
      bars: 2,
      gross_return: 0.05,
      net_return: 0.048,
    },
  ],
  series: {
    open_time: [1700000000000, 1700003600000, 1700007200000],
    equity: [1.0, 1.03, 1.04],
    drawdown: [0, -0.005, -0.01],
    signal: [1, 0, 0],
    proba: [0.7, 0.6, 0.5],
  },
  data_meta: { n_train: 100, n_test: 60, start: 1700000000000, end: 1700007200000 },
};

const symbols = [
  { id: "BTCUSDT", ticker: "BTCUSDT" },
  { id: "ETHUSDT", ticker: "ETHUSDT" },
];

describe("QuantLabPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getConfig.mockResolvedValue({ factors: null });
    apiMock.backtestHistory.mockResolvedValue({ runs: [] });
    apiMock.candles.mockResolvedValue({ candles: [], count: 0 });
  });

  it("renders controls, KPI row and tabbed empty states on mount", async () => {
    render(<QuantLabPanel symbols={symbols as never} theme="dark" />);
    expect(screen.getByText("回测参数")).toBeInTheDocument();
    expect(screen.getByText("Run Backtest")).toBeInTheDocument();
    await waitFor(() => expect(apiMock.getConfig).toHaveBeenCalled());
    // Tabs present.
    expect(screen.getByText("信号K线")).toBeInTheDocument();
    expect(screen.getByText("曲线分析")).toBeInTheDocument();
    expect(screen.getByText("参数扫描")).toBeInTheDocument();
    expect(screen.getByText("Walk-forward")).toBeInTheDocument();
    expect(screen.getByText("开单明细")).toBeInTheDocument();
    expect(screen.getByText("历史")).toBeInTheDocument();
  });

  it("runs a backtest and renders curves tab with full KPI cards", async () => {
    apiMock.backtest.mockResolvedValue({ job_id: "j1" });
    apiMock.job.mockResolvedValue({ status: "done", result: fakeResult });
    render(<QuantLabPanel symbols={symbols as never} theme="dark" />);

    fireEvent.click(screen.getByText("Run Backtest"));

    // The run auto-switches to the 信号K线 tab; jump to curves for the KPI check.
    await waitFor(() => expect(screen.getByTestId("signal-kline-chart")).toBeInTheDocument(), {
      timeout: 8000,
    });
    const curvesTab = screen.getByRole("tab", { name: "曲线分析" });
    fireEvent.mouseDown(curvesTab);
    fireEvent.mouseUp(curvesTab);
    fireEvent.click(curvesTab);
    await waitFor(() => expect(screen.getByText("权益曲线 (vs 基准)")).toBeInTheDocument(), {
      timeout: 8000,
    });
    // KPI cards from stats + model_metrics.
    expect(screen.getByText("Sharpe")).toBeInTheDocument();
    expect(screen.getByText("Sortino")).toBeInTheDocument();
    expect(screen.getByText("AUC")).toBeInTheDocument();
    expect(screen.getByText("LogLoss")).toBeInTheDocument();
    // Econ charts present in curves tab.
    expect(screen.getByText("月度收益")).toBeInTheDocument();
    expect(screen.getByText("收益分布直方图")).toBeInTheDocument();
  });

  it("shows trade list in the 开单明细 tab", async () => {
    apiMock.backtest.mockResolvedValue({ job_id: "j1" });
    apiMock.job.mockResolvedValue({ status: "done", result: fakeResult });
    render(<QuantLabPanel symbols={symbols as never} theme="dark" />);

    fireEvent.click(screen.getByText("Run Backtest"));
    await waitFor(() => expect(screen.getByTestId("signal-kline-chart")).toBeInTheDocument(), {
      timeout: 8000,
    });
    const tab = screen.getByRole("tab", { name: "开单明细" });
    fireEvent.mouseDown(tab);
    fireEvent.mouseUp(tab);
    fireEvent.click(tab);
    expect(await screen.findByText("开单列表 (1)", undefined, { timeout: 5000 })).toBeInTheDocument();
  });

  it("shows an error banner when the job fails", async () => {
    apiMock.backtest.mockResolvedValue({ job_id: "j2" });
    apiMock.job.mockResolvedValue({ status: "error", error: "boom" });
    render(<QuantLabPanel symbols={symbols as never} theme="dark" />);

    fireEvent.click(screen.getByText("Run Backtest"));

    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument(), {
      timeout: 8000,
    });
  });
});
