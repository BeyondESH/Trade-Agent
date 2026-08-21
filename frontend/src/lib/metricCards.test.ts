import { describe, expect, it } from "vitest";
import { buildMetricCards } from "./metricCards";
import type { BacktestJobResult } from "../api/types";

const base: BacktestJobResult = {
  total_return: 0.12,
  max_drawdown: -0.08,
  win_rate: 0.54,
  trades: 47,
  bars: 500,
  test_bars: 150,
};

describe("buildMetricCards", () => {
  it("renders returns and trade cards", () => {
    const cards = buildMetricCards(base);
    expect(cards.find((c) => c.label === "总收益")?.value).toBe("12.00%");
    expect(cards.find((c) => c.label === "最大回撤")?.value).toBe("-8.00%");
    expect(cards.find((c) => c.label === "胜率")?.value).toBe("54.00%");
    expect(cards.find((c) => c.label === "交易次数")?.value).toBe("47");
  });

  it("maps stats to risk-adjusted cards", () => {
    const cards = buildMetricCards({ ...base, stats: { sharpe_ratio: 1.42, sortino_ratio: 1.1 } });
    expect(cards.find((c) => c.label === "Sharpe")?.value).toBe("1.42");
    expect(cards.find((c) => c.label === "Sortino")?.value).toBe("1.1");
    // Missing stats fields fall back to placeholder (null).
    expect(cards.find((c) => c.label === "Calmar")?.value).toBeNull();
    expect(cards.find((c) => c.label === "Profit Factor")?.value).toBeNull();
  });

  it("maps model_metrics to AUC/LogLoss cards", () => {
    const cards = buildMetricCards({ ...base, model_metrics: { roc_auc: 0.72, log_loss: 0.61 } });
    expect(cards.find((c) => c.label === "AUC")?.value).toBe("0.72");
    expect(cards.find((c) => c.label === "LogLoss")?.value).toBe("0.61");
  });

  it("shows placeholder when metrics are missing entirely", () => {
    const cards = buildMetricCards(base);
    expect(cards.find((c) => c.label === "AUC")?.value).toBeNull();
    expect(cards.find((c) => c.label === "LogLoss")?.value).toBeNull();
  });

  it("tones return positive/negative", () => {
    const cards = buildMetricCards(base);
    expect(cards.find((c) => c.label === "总收益")?.tone).toBe("good");
    const neg = buildMetricCards({ ...base, total_return: -0.03 });
    expect(neg.find((c) => c.label === "总收益")?.tone).toBe("bad");
  });
});
