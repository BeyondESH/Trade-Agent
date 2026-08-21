import React from "react";
import { ThemeMode } from "../../../types/trading";
import type { BacktestJobResult } from "../../../api/types";
import { cardCls, fmtNum, fmtPct } from "./ui";

const MetricCard: React.FC<{ label: string; value: string; tone?: "good" | "bad" | "plain"; theme: ThemeMode }> = ({
  label,
  value,
  tone = "plain",
  theme,
}) => {
  const color =
    tone === "good"
      ? theme === "dark"
        ? "text-[#089981]"
        : "text-[#089981]"
      : tone === "bad"
        ? "text-[#f23645]"
        : theme === "dark"
          ? "text-[#d1d4dc]"
          : "text-[#131722]";
  return (
    <div className={`${cardCls(theme)} p-3 flex flex-col gap-1`}>
      <span className="text-[11px] font-semibold text-gray-400">{label}</span>
      <span className={`font-mono font-bold text-base ${color}`}>{value}</span>
    </div>
  );
};

/** Scalar metric cards rendered from a completed backtest job result. */
export const MetricCards: React.FC<{ result: BacktestJobResult; theme: ThemeMode }> = ({
  result,
  theme,
}) => {
  const ret = result.total_return;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      <MetricCard
        label="总收益"
        value={fmtPct(ret)}
        tone={ret !== undefined && ret >= 0 ? "good" : "bad"}
        theme={theme}
      />
      <MetricCard label="最大回撤" value={fmtPct(result.max_drawdown)} tone="bad" theme={theme} />
      <MetricCard label="胜率" value={fmtPct(result.win_rate)} theme={theme} />
      <MetricCard label="交易次数" value={fmtNum(result.trades, 0)} theme={theme} />
      <MetricCard label="测试 bar 数" value={fmtNum(result.test_bars ?? result.bars, 0)} theme={theme} />
    </div>
  );
};
