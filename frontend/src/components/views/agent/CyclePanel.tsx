import React, { useState } from "react";
import { ThemeMode } from "../../../types/trading";
import { api } from "../../../api/client";
import { Panel, btnCls, fmtNum } from "./ui";

interface Props {
  symbol: string;
  timeframe: string;
  theme: ThemeMode;
}

/** Runs one memory-augmented paper cycle via /agent/cycle and shows the result. */
export const CyclePanel: React.FC<Props> = ({ symbol, timeframe, theme }) => {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.agentCycle({ category: "USDT-FUTURES", symbol, timeframe }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const decision = result?.decision as Record<string, unknown> | undefined;

  return (
    <Panel
      title="纸面循环 (记忆增强 + 风控)"
      theme={theme}
      right={
        <button onClick={run} disabled={loading} className={btnCls(theme, "ghost")}>
          {loading ? "循环中..." : "Run Cycle"}
        </button>
      }
    >
      {error && <span className="text-xs text-[#f23645]">✕ {error}</span>}
      {!result && !error && <span className="text-xs text-gray-500">执行一次完整的决策 → 风控校验 → 纸面成交循环。</span>}
      {result && (
        <div className="flex flex-col gap-2 text-xs font-mono">
          <div className="flex flex-wrap gap-4">
            <span>
              状态: <span className="text-[#089981]">{String(result.status ?? "ok")}</span>
            </span>
            {decision && (
              <>
                <span>
                  动作: <b>{String(decision.action ?? "")}</b> {decision.side ? String(decision.side) : ""}
                </span>
                {decision.reference_price != null && (
                  <span>参考价: {fmtNum(Number(decision.reference_price))}</span>
                )}
              </>
            )}
            {result.approved !== undefined && (
              <span>
                风控:{" "}
                {result.approved ? (
                  <span className="text-[#089981]">通过</span>
                ) : (
                  <span className="text-[#f23645]">拒绝</span>
                )}
              </span>
            )}
          </div>
          <pre className={`whitespace-pre-wrap rounded-lg p-2 text-[11px] ${theme === "dark" ? "bg-[#131722]" : "bg-[#f0f3fa]"}`}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </Panel>
  );
};
