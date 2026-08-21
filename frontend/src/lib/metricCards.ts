import type { BacktestJobResult } from "../api/types";

export interface MetricCardDef {
  group: "returns" | "risk" | "trades" | "model";
  label: string;
  value: string | null;
  tone?: "good" | "bad" | "plain";
}

const fmtPct = (v: number | null | undefined): string | null => {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return `${(v * 100).toFixed(2)}%`;
};

const fmtNum = (v: number | null | undefined, digits = 2): string | null => {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
};

/**
 * Build the KPI card set from a backtest result. Renders returns, risk-adjusted
 * stats (from `stats`), trade counts and model metrics (from `model_metrics`).
 * Missing fields yield null values so the UI can show a placeholder.
 */
export function buildMetricCards(result: BacktestJobResult): MetricCardDef[] {
  const cards: MetricCardDef[] = [];
  const ret = result.total_return;

  cards.push({
    group: "returns",
    label: "总收益",
    value: fmtPct(ret),
    tone: ret !== undefined && ret >= 0 ? "good" : "bad",
  });
  cards.push({
    group: "returns",
    label: "最大回撤",
    value: fmtPct(result.max_drawdown),
    tone: "bad",
  });
  cards.push({
    group: "trades",
    label: "胜率",
    value: fmtPct(result.win_rate),
  });
  cards.push({
    group: "trades",
    label: "交易次数",
    value: fmtNum(result.trades, 0),
  });
  cards.push({
    group: "trades",
    label: "测试 bar 数",
    value: fmtNum(result.test_bars ?? result.bars, 0),
  });

  const stats = result.stats ?? {};
  cards.push({ group: "risk", label: "Sharpe", value: fmtNum(stats.sharpe_ratio) });
  cards.push({ group: "risk", label: "Sortino", value: fmtNum(stats.sortino_ratio) });
  cards.push({ group: "risk", label: "Calmar", value: fmtNum(stats.calmar_ratio) });
  cards.push({ group: "risk", label: "Profit Factor", value: fmtNum(stats.profit_factor) });

  const mm = result.model_metrics ?? {};
  cards.push({
    group: "model",
    label: "AUC",
    value: fmtNum(mm.roc_auc),
    tone: mm.roc_auc != null && mm.roc_auc >= 0.5 ? "good" : "plain",
  });
  cards.push({
    group: "model",
    label: "LogLoss",
    value: fmtNum(mm.log_loss),
    tone: mm.log_loss != null && mm.log_loss <= 0.7 ? "good" : "plain",
  });

  return cards;
}
