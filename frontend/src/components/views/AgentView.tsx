import React, { useState } from "react";
import { ThemeMode, SymbolInfo } from "../../types/trading";
import { QuantLabPanel } from "./agent/QuantLabPanel";
import { AgentAnalysisTab } from "./agent/AgentAnalysisTab";

interface Props {
  symbols: SymbolInfo[];
  theme: ThemeMode;
}

type AgentTab = "quant" | "agent";

/** AI Agent page: Tab1 QUANT LAB 量化研究面板, Tab2 Agent 行情分析.
 * All tabs stay mounted so switching never loses in-flight state. */
export const AgentView: React.FC<Props> = ({ symbols, theme }) => {
  const [tab, setTab] = useState<AgentTab>("quant");

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
        {tabBtn("quant", "QUANT LAB")}
        {tabBtn("agent", "AI Agent 分析")}
      </div>
      <div className={tab === "quant" ? "flex-1 overflow-y-auto p-4" : "hidden"}>
        <QuantLabPanel symbols={symbols} theme={theme} />
      </div>
      <div className={tab === "agent" ? "flex-1 overflow-y-auto p-4" : "hidden"}>
        <AgentAnalysisTab symbols={symbols} theme={theme} />
      </div>
    </div>
  );
};
