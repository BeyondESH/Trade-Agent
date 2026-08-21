import React, { useState } from "react";
import { ThemeMode, SymbolInfo } from "../../../types/trading";
import type { AgentDecision } from "../../../api/types";
import { api } from "../../../api/client";
import { Panel, Field, btnCls, selectCls, fmtNum } from "./ui";

interface Props {
  symbols: SymbolInfo[];
  symbol: string;
  timeframe: string;
  onSymbol: (s: string) => void;
  onTimeframe: (tf: string) => void;
  theme: ThemeMode;
}

const TIMEFRAMES = ["1m", "5m", "1h", "4h", "1d"];

/** Decision-only panel: calls /agent/decide and shows the structured suggestion. */
export const DecisionPanel: React.FC<Props> = ({ symbols, symbol, timeframe, onSymbol, onTimeframe, theme }) => {
  const [decision, setDecision] = useState<AgentDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setLoading(true);
    setError(null);
    try {
      setDecision(await api.agentDecide({ category: "USDT-FUTURES", symbol, timeframe }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const tone =
    decision?.action === "hold"
      ? "text-gray-400"
      : decision?.side === "long"
        ? "text-[#089981]"
        : decision?.side === "short"
          ? "text-[#f23645]"
          : "text-[#2962ff]";

  return (
    <Panel
      title="Agent 决策 (只出建议)"
      theme={theme}
      right={
        <div className="flex items-end gap-2">
          <select value={symbol} onChange={(e) => onSymbol(e.target.value)} className={selectCls(theme)}>
            {symbols.map((s) => (
              <option key={s.id} value={s.id}>
                {s.ticker}
              </option>
            ))}
          </select>
          <select value={timeframe} onChange={(e) => onTimeframe(e.target.value)} className={selectCls(theme)}>
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
          <button onClick={ask} disabled={loading} className={btnCls(theme)}>
            {loading ? "思考中..." : "Ask Agent"}
          </button>
        </div>
      }
    >
      {error && <span className="text-xs text-[#f23645]">✕ {error}</span>}
      {!decision && !error && <span className="text-xs text-gray-500">请求一次结构化开/平仓建议,不会产生任何下单。</span>}
      {decision && (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-3">
            <span className={`font-bold text-lg ${tone}`}>
              {decision.action === "open" ? `OPEN ${decision.side?.toUpperCase() ?? ""}` : decision.action.toUpperCase()}
            </span>
            <span className="font-mono">{decision.symbol}</span>
            {decision.reference_price != null && (
              <span className="font-mono text-gray-400">参考价 {fmtNum(decision.reference_price)}</span>
            )}
            <span className="font-mono text-xs text-gray-400">置信 {fmtNum(decision.confidence * 100, 1)}%</span>
          </div>
          <p className="text-xs leading-relaxed text-gray-400">{decision.reason}</p>
        </div>
      )}
    </Panel>
  );
};
