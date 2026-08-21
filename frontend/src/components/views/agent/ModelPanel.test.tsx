// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ModelPanel, matchPreset, MODEL_PRESETS } from "./ModelPanel";
import type { BacktestParams } from "../../../api/types";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

describe("matchPreset", () => {
  it("returns custom for empty/partial params", () => {
    expect(matchPreset({ train_ratio: 0.7 })).toBe("custom");
    expect(matchPreset({})).toBe("custom");
  });

  it("matches a preset when the full snapshot equals it", () => {
    const p = MODEL_PRESETS.find((x) => x.id === "hgb-fast")!;
    expect(matchPreset(p.params)).toBe("hgb-fast");
  });

  it("degrades to custom when any param deviates", () => {
    const p = MODEL_PRESETS.find((x) => x.id === "conservative-lr")!;
    const tweaked: BacktestParams = { ...p.params, C: 0.7 };
    expect(matchPreset(tweaked)).toBe("custom");
  });

  it("treats a missing template key as a deviation", () => {
    const p = MODEL_PRESETS.find((x) => x.id === "aggressive-lr")!;
    expect(matchPreset({ ...p.params, train_ratio: undefined })).toBe("custom");
  });
});

describe("ModelPanel", () => {
  const base: BacktestParams = { train_ratio: 0.7, thresh: 0.55, fee: 0.0004, slippage: 0.0005 };

  it("renders preset buttons and model switch", () => {
    render(<ModelPanel params={base} onChange={() => {}} theme="dark" />);
    expect(screen.getByText("模型控制")).toBeInTheDocument();
    expect(screen.getByText("稳健 lr")).toBeInTheDocument();
    expect(screen.getByText("激进 lr")).toBeInTheDocument();
    expect(screen.getByText("HGB 快速")).toBeInTheDocument();
    expect(screen.getByText("逻辑回归 (lr)")).toBeInTheDocument();
    expect(screen.getByText("梯度提升 (hgb)")).toBeInTheDocument();
  });

  it("applies a preset template on click", () => {
    const onChange = vi.fn();
    render(<ModelPanel params={base} onChange={onChange} theme="dark" />);
    fireEvent.click(screen.getByText("HGB 快速"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as BacktestParams;
    expect(next.model).toBe("hgb");
    expect(next.max_depth).toBe(4);
    expect(next.scale).toBe(false);
  });

  it("switching model clears the other model's hyperparameters", () => {
    const onChange = vi.fn();
    const withHgb: BacktestParams = { ...base, model: "hgb", max_depth: 4, learning_rate: 0.1 };
    render(<ModelPanel params={withHgb} onChange={onChange} theme="dark" />);
    fireEvent.click(screen.getByText("逻辑回归 (lr)"));
    const next = onChange.mock.calls[0][0] as BacktestParams;
    expect(next.model).toBe("lr");
    expect(next.max_depth).toBeUndefined();
    expect(next.learning_rate).toBeUndefined();
  });

  it("number input edits propagate through onChange", () => {
    const onChange = vi.fn();
    render(<ModelPanel params={base} onChange={onChange} theme="dark" />);
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    const cashInput = inputs.find((i) => Number(i.min) === 1000);
    expect(cashInput).toBeTruthy();
    fireEvent.change(cashInput!, { target: { value: "500000" } });
    const next = onChange.mock.calls[0][0] as BacktestParams;
    expect(next.init_cash).toBe(500000);
  });

  it("scaler toggle flips scale flag", () => {
    const onChange = vi.fn();
    render(<ModelPanel params={base} onChange={onChange} theme="dark" />);
    fireEvent.click(screen.getByLabelText(/标准化/));
    const next = onChange.mock.calls[0][0] as BacktestParams;
    expect(next.scale).toBe(false);
  });
});
