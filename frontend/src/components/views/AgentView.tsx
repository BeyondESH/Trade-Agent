import React, { useState } from "react";
import { ThemeMode, SymbolInfo } from "../../types/trading";
import { DlQuantTab } from "./agent/DlQuantTab";
import { AgentAnalysisTab } from "./agent/AgentAnalysisTab";
import { BacktestTab } from "./agent/BacktestTab";

interface Props {
  symbols: SymbolInfo[];
  theme: ThemeMode;
}

type AgentTab = "dl" | "agent" | "backtest";

/** AI Agent page: Tab1 DL 量化工作台, Tab2 Agent 行情分析, Tab3 回测.
 * All tabs stay mounted so switching never loses in-flight state. */
export const AgentView: React.FC<Props> = ({ symbols, theme }) => {
  const [tab, setTab] = useState<AgentTab>("dl");

  const tabBtn = (id: AgentTab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
        tab === id
          ? "bg-[#2962ff] text-white"
          : theme === "dark"
            ? "text-[#787b86] hover:text-white hover:bg-[#1e222d]"
            : "text-[#606470] hover:text-black hover:bg-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div
        className={`flex items-center gap-1 px-4 pt-3 pb-2 border-b shrink-0 ${
          theme === "dark" ? "border-[#2a2e39]" : "border-[#cbcfd9]"
        }`}
      >
        {tabBtn("dl", "深度学习量化")}
        {tabBtn("agent", "AI Agent 分析")}
        {tabBtn("backtest", "回测")}
      </div>
      <div className={tab === "dl" ? "flex-1 overflow-y-auto p-4" : "hidden"}>
        <DlQuantTab symbols={symbols} theme={theme} />
      </div>
      <div className={tab === "agent" ? "flex-1 overflow-y-auto p-4" : "hidden"}>
        <AgentAnalysisTab symbols={symbols} theme={theme} />
      </div>
      <div className={tab === "backtest" ? "flex-1 overflow-y-auto p-4" : "hidden"}>
        <BacktestTab symbols={symbols} theme={theme} />
      </div>
    </div>
  );
};
