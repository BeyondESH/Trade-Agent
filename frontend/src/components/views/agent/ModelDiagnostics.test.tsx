// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelDiagnostics } from "./ModelDiagnostics";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

const base = {
  total_return: 0.04,
  model_metrics: { roc_auc: 0.72, log_loss: 0.61 },
};

describe("ModelDiagnostics", () => {
  it("renders ROC curve with AUC", () => {
    const result = {
      ...base,
      roc_curve: { fpr: [0, 0.2, 1], tpr: [0, 0.8, 1] },
    };
    render(<ModelDiagnostics result={result as never} theme="dark" />);
    expect(screen.getByText("ROC 曲线")).toBeInTheDocument();
    expect(screen.getByText(/AUC/)).toBeInTheDocument();
    expect(screen.getByText("0.7200")).toBeInTheDocument();
  });

  it("renders lr coefficient weights with sign colors", () => {
    const result = {
      ...base,
      feature_weights: {
        kind: "coef" as const,
        features: ["log_ret", "macd_hist"],
        values: [0.5, -0.2],
      },
    };
    render(<ModelDiagnostics result={result as never} theme="dark" />);
    expect(screen.getByText("特征权重 (逻辑回归系数)")).toBeInTheDocument();
  });

  it("renders hgb importance weights", () => {
    const result = {
      ...base,
      feature_weights: {
        kind: "importance" as const,
        features: ["rsi_14"],
        values: [0.3],
      },
    };
    render(<ModelDiagnostics result={result as never} theme="dark" />);
    expect(screen.getByText("特征权重 (特征重要性)")).toBeInTheDocument();
  });

  it("shows empty states when data is missing", () => {
    render(<ModelDiagnostics result={base as never} theme="dark" />);
    expect(screen.getByText("无 ROC 数据(测试集退化或旧记录)")).toBeInTheDocument();
    expect(screen.getByText("无特征权重数据(旧记录或该模型不导出)")).toBeInTheDocument();
  });
});
