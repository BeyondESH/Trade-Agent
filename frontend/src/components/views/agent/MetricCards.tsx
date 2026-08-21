import React from "react";
import { ThemeMode } from "../../../types/trading";
import type { BacktestJobResult } from "../../../api/types";
import { cardCls } from "./ui";
import { buildMetricCards, MetricCardDef } from "../../../lib/metricCards";

const MetricCard: React.FC<{ def: MetricCardDef; theme: ThemeMode }> = ({ def, theme }) => {
  const color =
    def.tone === "good"
      ? "text-[#089981]"
      : def.tone === "bad"
        ? "text-[#f23645]"
        : theme === "dark"
          ? "text-[#d1d4dc]"
          : "text-[#131722]";
  return (
    <div className={`${cardCls(theme)} p-3 flex flex-col gap-1`}>
      <span className="text-[11px] font-semibold text-gray-400">{def.label}</span>
      <span className={`font-mono font-bold text-base ${color}`}>{def.value ?? "—"}</span>
    </div>
  );
};

/** KPI metric cards rendered from a completed backtest job result. */
export const MetricCards: React.FC<{ result: BacktestJobResult; theme: ThemeMode }> = ({
  result,
  theme,
}) => {
  const cards = buildMetricCards(result);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {cards
          .filter((c) => c.group === "returns" || c.group === "trades")
          .map((c) => (
            <MetricCard key={c.label} def={c} theme={theme} />
          ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {cards
          .filter((c) => c.group === "risk" || c.group === "model")
          .map((c) => (
            <MetricCard key={c.label} def={c} theme={theme} />
          ))}
      </div>
    </div>
  );
};
