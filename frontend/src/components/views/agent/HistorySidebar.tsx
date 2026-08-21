import React, { useCallback, useEffect, useState } from "react";
import { ThemeMode } from "../../../types/trading";
import type { BacktestHistoryMeta } from "../../../api/types";
import { api } from "../../../api/client";
import { Panel, cardCls, fmtPct, fmtTime } from "./ui";

interface Props {
  activeId: string | null;
  onSelect: (id: string) => void;
  onDeleted: (id: string) => void;
  theme: ThemeMode;
}

/** Backtest run history list; clicking a run loads its full detail. */
export const HistorySidebar: React.FC<Props> = ({ activeId, onSelect, onDeleted, theme }) => {
  const [runs, setRuns] = useState<BacktestHistoryMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api
      .backtestHistory()
      .then((res) => setRuns(res.runs))
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      try {
        await api.backtestHistoryDelete(id);
        setRuns((prev) => (prev ?? []).filter((r) => r.id !== id));
        onDeleted(id);
      } catch (e) {
        setError(String(e));
      }
    },
    [onDeleted],
  );

  return (
    <Panel
      title="回测历史"
      theme={theme}
      right={
        <button
          onClick={refresh}
          className="text-[11px] text-[#2962ff] hover:underline font-semibold"
        >
          刷新
        </button>
      }
    >
      {error && <span className="text-xs text-[#f23645]">{error}</span>}
      {runs === null ? (
        <div className="text-sm text-gray-400 py-2">加载中...</div>
      ) : runs.length === 0 ? (
        <div className="text-sm text-gray-400 py-2">暂无历史回测</div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[560px] overflow-y-auto">
          {runs.map((r) => {
            const active = r.id === activeId;
            return (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(r.id);
                  }
                }}
                className={`${cardCls(theme)} p-2.5 text-left flex flex-col gap-1 transition-colors cursor-pointer ${
                  active
                    ? "ring-1 ring-[#2962ff]"
                    : theme === "dark"
                      ? "hover:bg-[#1e222d]"
                      : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold">
                    {r.symbol} <span className="text-gray-400">{r.timeframe}</span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(r.id);
                    }}
                    className="text-[10px] text-[#f23645] hover:underline shrink-0"
                  >
                    删除
                  </button>
                </div>
                <div className="text-[10px] text-gray-400 font-mono">{fmtTime(r.created_at)}</div>
                <div className="flex justify-between text-[11px] font-mono">
                  <span>
                    总收益{" "}
                    <span className={active ? "text-[#2962ff]" : ""}>
                      {fmtPct(r.metrics?.total_return)}
                    </span>
                  </span>
                  <span className="text-gray-400">{fmtPct(r.metrics?.max_drawdown)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
};
