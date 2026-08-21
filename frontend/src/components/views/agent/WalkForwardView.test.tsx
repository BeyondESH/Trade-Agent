// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FoldRanges, WalkForwardView } from "./WalkForwardView";
import type { WalkForwardResult } from "../../../api/types";

const wfResult: WalkForwardResult = {
  folds: [
    { fold: 0, train_start: 100, train_end: 200, test_start: 200, test_end: 300, total_return: 0.05, max_drawdown: -0.02, win_rate: 0.6, trades: 5, roc_auc: 0.7, log_loss: 0.6 },
    { fold: 1, train_start: 200, train_end: 300, test_start: 300, test_end: 400, total_return: -0.01, max_drawdown: -0.03, win_rate: 0.4, trades: 3, roc_auc: 0.65, log_loss: 0.68 },
  ],
  data_meta: { n_train: 300, n_test: 100, start: 100, end: 400 },
};

describe("WalkForwardView", () => {
  it("renders empty-state when nothing ran", () => {
    render(<WalkForwardView running={false} result={null} onRun={vi.fn()} theme="dark" />);
    expect(screen.getByText(/点击「运行 Walk-forward」/)).toBeInTheDocument();
  });

  it("renders fold table with metrics", () => {
    render(<WalkForwardView running={false} result={wfResult} onRun={vi.fn()} theme="dark" />);
    expect(screen.getAllByText("#1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("#2").length).toBeGreaterThan(0);
    expect(screen.getByText("0.700")).toBeInTheDocument();
    expect(screen.getByText("5.00%")).toBeInTheDocument();
    expect(screen.getByText("-1.00%")).toBeInTheDocument();
  });

  it("runs on button click", () => {
    const onRun = vi.fn();
    render(<WalkForwardView running={false} result={null} onRun={onRun} theme="dark" />);
    fireEvent.click(screen.getByText("运行 Walk-forward"));
    expect(onRun).toHaveBeenCalled();
  });

  it("passes edited n_splits to onRun", () => {
    const onRun = vi.fn();
    render(<WalkForwardView running={false} result={null} onRun={onRun} theme="dark" />);
    const input = screen.getByPlaceholderText("自动") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.click(screen.getByText("运行 Walk-forward"));
    expect(onRun).toHaveBeenCalledWith(8);
  });

  it("passes undefined when n_splits is left empty", () => {
    const onRun = vi.fn();
    render(<WalkForwardView running={false} result={null} onRun={onRun} theme="dark" />);
    fireEvent.click(screen.getByText("运行 Walk-forward"));
    expect(onRun).toHaveBeenCalledWith(undefined);
  });
});

describe("FoldRanges", () => {
  it("renders one bar per fold", () => {
    const { container } = render(<FoldRanges folds={wfResult.folds} theme="dark" />);
    expect(container.querySelectorAll(".relative.h-6").length).toBe(2);
  });
});
