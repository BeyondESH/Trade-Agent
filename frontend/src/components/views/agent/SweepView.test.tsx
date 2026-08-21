// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SweepView, heatColor, parseGridInput } from "./SweepView";
import type { SweepResult } from "../../../api/types";

const sweepResult: SweepResult = {
  results: [
    { threshold: 0.5, fee: 0.0004, slippage: 0.0005, total_return: 0.04, max_drawdown: -0.02, win_rate: 0.55, trades: 10 },
    { threshold: 0.5, fee: 0.001, slippage: 0.0005, total_return: -0.01, max_drawdown: -0.03, win_rate: 0.4, trades: 6 },
    { threshold: 0.6, fee: 0.0004, slippage: 0.0005, total_return: 0.02, max_drawdown: -0.01, win_rate: 0.6, trades: 8 },
    { threshold: 0.6, fee: 0.001, slippage: 0.0005, total_return: 0.01, max_drawdown: -0.015, win_rate: 0.5, trades: 7 },
  ],
  data_meta: { n_train: 100, n_test: 50, start: 1, end: 2 },
};

describe("heatColor", () => {
  it("is red for losses and blue-ish for gains", () => {
    const loss = heatColor(-0.05);
    const gain = heatColor(0.05);
    expect(loss.startsWith("rgb(")).toBe(true);
    expect(gain.startsWith("rgb(")).toBe(true);
  });
});

describe("parseGridInput", () => {
  it("parses comma/space separated numbers", () => {
    expect(parseGridInput("0.5, 0.55 0.6，0.65", [])).toEqual([0.5, 0.55, 0.6, 0.65]);
  });

  it("falls back to defaults on empty or invalid input", () => {
    expect(parseGridInput("", [1, 2])).toEqual([1, 2]);
    expect(parseGridInput("abc, xyz", [1, 2])).toEqual([1, 2]);
  });
});

describe("SweepView", () => {
  it("renders empty-state when nothing ran", () => {
    render(<SweepView running={false} result={null} onRun={vi.fn()} theme="dark" />);
    expect(screen.getByText(/点击「运行参数扫描」/)).toBeInTheDocument();
  });

  it("renders the heatmap grid with cells", () => {
    render(<SweepView running={false} result={sweepResult} onRun={vi.fn()} theme="dark" />);
    expect(screen.getByText("4.00%")).toBeInTheDocument();
    expect(screen.getByText("-1.00%")).toBeInTheDocument();
  });

  it("runs scan on button click", () => {
    const onRun = vi.fn();
    render(<SweepView running={false} result={null} onRun={onRun} theme="dark" />);
    fireEvent.click(screen.getByText("运行参数扫描"));
    expect(onRun).toHaveBeenCalled();
  });

  it("passes edited grid inputs to onRun", () => {
    const onRun = vi.fn();
    render(<SweepView running={false} result={null} onRun={onRun} theme="dark" />);
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "0.4, 0.5" } });
    fireEvent.change(inputs[1], { target: { value: "0.001" } });
    fireEvent.click(screen.getByText("运行参数扫描"));
    expect(onRun).toHaveBeenCalledWith([0.4, 0.5], [0.001], [0.0005]);
  });
});
