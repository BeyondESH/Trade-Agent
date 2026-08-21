// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HistorySidebar } from "./HistorySidebar";
import type { BacktestHistoryMeta } from "../../../api/types";

const apiMock = vi.hoisted(() => ({
  backtestHistory: vi.fn(),
  backtestHistoryDelete: vi.fn(),
}));

vi.mock("../../../api/client", () => ({ api: apiMock }));

const mkRun = (id: string, symbol = "BTCUSDT"): BacktestHistoryMeta => ({
  id,
  created_at: 1700000000000,
  category: "USDT-FUTURES",
  symbol,
  timeframe: "1h",
  params: {},
  factors: [],
  metrics: { total_return: 0.05, max_drawdown: -0.02, trades: 3 },
  data_meta: { n_train: 100, n_test: 30, start: 0, end: 1 },
});

describe("HistorySidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and lists runs on mount", async () => {
    apiMock.backtestHistory.mockResolvedValue({ runs: [mkRun("a"), mkRun("b", "ETHUSDT")] });
    render(<HistorySidebar activeId={null} onSelect={vi.fn()} onDeleted={vi.fn()} theme="dark" />);
    await waitFor(() => expect(screen.getByText("BTCUSDT")).toBeInTheDocument());
    expect(screen.getByText("ETHUSDT")).toBeInTheDocument();
    expect(screen.getAllByText(/总收益/)).toHaveLength(2);
    expect(screen.getAllByText("5.00%")).toHaveLength(2);
  });

  it("shows an empty hint when there is no history", async () => {
    apiMock.backtestHistory.mockResolvedValue({ runs: [] });
    render(<HistorySidebar activeId={null} onSelect={vi.fn()} onDeleted={vi.fn()} theme="dark" />);
    await waitFor(() => expect(screen.getByText("暂无历史回测")).toBeInTheDocument());
  });

  it("selects a run and deletes it without losing the rest", async () => {
    apiMock.backtestHistory.mockResolvedValue({ runs: [mkRun("a"), mkRun("b")] });
    apiMock.backtestHistoryDelete.mockResolvedValue({ deleted: true });
    const onSelect = vi.fn();
    const onDeleted = vi.fn();
    render(<HistorySidebar activeId={null} onSelect={onSelect} onDeleted={onDeleted} theme="dark" />);

    await waitFor(() => expect(screen.getAllByText("删除")).toHaveLength(2));
    fireEvent.click(screen.getAllByText("删除")[0]);
    await waitFor(() => expect(apiMock.backtestHistoryDelete).toHaveBeenCalledWith("a"));
    await waitFor(() => expect(screen.getAllByText("删除")).toHaveLength(1));
    expect(onDeleted).toHaveBeenCalledWith("a");
  });

  it("calls onSelect when a run is clicked", async () => {
    apiMock.backtestHistory.mockResolvedValue({ runs: [mkRun("a")] });
    const onSelect = vi.fn();
    render(<HistorySidebar activeId={null} onSelect={onSelect} onDeleted={vi.fn()} theme="dark" />);
    await waitFor(() => expect(screen.getByText("BTCUSDT")).toBeInTheDocument());
    fireEvent.click(screen.getByText("BTCUSDT"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("marks the active run with a highlight", async () => {
    apiMock.backtestHistory.mockResolvedValue({ runs: [mkRun("a")] });
    render(<HistorySidebar activeId="a" onSelect={vi.fn()} onDeleted={vi.fn()} theme="dark" />);
    await waitFor(() => expect(screen.getByText("BTCUSDT")).toBeInTheDocument());
    expect(screen.getByText("5.00%").className).toContain("text-[#2962ff]");
  });
});
