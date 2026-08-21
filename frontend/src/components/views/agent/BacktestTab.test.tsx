// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BacktestTab } from "./BacktestTab";

const apiMock = vi.hoisted(() => ({
  getConfig: vi.fn(),
  backtest: vi.fn(),
  job: vi.fn(),
  backtestHistory: vi.fn(),
  backtestHistoryDetail: vi.fn(),
  backtestHistoryDelete: vi.fn(),
}));

vi.mock("../../../api/client", () => ({ api: apiMock }));

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

describe("BacktestTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getConfig.mockResolvedValue({ factors: null });
    apiMock.backtestHistory.mockResolvedValue({ runs: [] });
  });

  it("renders controls and empty state on mount", async () => {
    render(<BacktestTab symbols={symbols as never} theme="dark" />);
    expect(screen.getByText("回测参数")).toBeInTheDocument();
    expect(screen.getByText("Run Backtest")).toBeInTheDocument();
    expect(screen.getByText(/设置参数后点击/)).toBeInTheDocument();
    await waitFor(() => expect(apiMock.getConfig).toHaveBeenCalled());
  });

  it("runs a backtest and renders trade table + econ charts", async () => {
    apiMock.backtest.mockResolvedValue({ job_id: "j1" });
    apiMock.job.mockResolvedValue({ status: "done", result: fakeResult });
    render(<BacktestTab symbols={symbols as never} theme="dark" />);

    fireEvent.click(screen.getByText("Run Backtest"));

    await waitFor(() => expect(apiMock.backtest).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() => expect(screen.getByText("开单列表 (1)")).toBeInTheDocument(), {
      timeout: 8000,
    });
    expect(screen.getByText("5.00%")).toBeInTheDocument(); // gross in trade table
    await waitFor(() => expect(screen.getByText("权益曲线")).toBeInTheDocument());
    expect(screen.getByText("回撤曲线")).toBeInTheDocument();
    expect(screen.getByText("月度收益")).toBeInTheDocument();
    expect(screen.getByText("单笔交易盈亏")).toBeInTheDocument();
    expect(screen.getByText("收益分布直方图")).toBeInTheDocument();
  });

  it("shows an error banner when the job fails", async () => {
    apiMock.backtest.mockResolvedValue({ job_id: "j2" });
    apiMock.job.mockResolvedValue({ status: "error", error: "boom" });
    render(<BacktestTab symbols={symbols as never} theme="dark" />);

    fireEvent.click(screen.getByText("Run Backtest"));

    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument(), {
      timeout: 8000,
    });
  });
});
