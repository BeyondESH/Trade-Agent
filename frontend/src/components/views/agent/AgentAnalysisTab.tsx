import React, { useState } from "react";
import { ThemeMode, SymbolInfo } from "../../../types/trading";
import { DecisionPanel } from "./DecisionPanel";
import { CyclePanel } from "./CyclePanel";
import { PortfolioPanel } from "./PortfolioPanel";
import { AgentConfigPanel } from "./AgentConfigPanel";

interface Props {
  symbols: SymbolInfo[];
  theme: ThemeMode;
}

/** Tab2: AI Agent 行情分析 — decision / paper cycle / portfolio / config. */
export const AgentAnalysisTab: React.FC<Props> = ({ symbols, theme }) => {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("1h");

  return (
    <div className="flex flex-col gap-4">
      <DecisionPanel
        symbols={symbols}
        symbol={symbol}
        timeframe={timeframe}
        onSymbol={setSymbol}
        onTimeframe={setTimeframe}
        theme={theme}
      />
      <CyclePanel symbol={symbol} timeframe={timeframe} theme={theme} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <PortfolioPanel theme={theme} />
        <AgentConfigPanel theme={theme} />
      </div>
    </div>
  );
};
