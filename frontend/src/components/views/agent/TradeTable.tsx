import React from "react";
import { ThemeMode } from "../../../types/trading";
import type { BacktestTrade } from "../../../api/types";
import { Panel, fmtNum, fmtPct, fmtTime } from "./ui";

/** Open/close trade list rendered from a backtest's per-trade records. */
export const TradeTable: React.FC<{ trades: BacktestTrade[]; theme: ThemeMode }> = ({
  trades,
  theme,
}) => {
  if (trades.length === 0) {
    return (
      <Panel title="开单列表" theme={theme}>
        <div className="text-sm text-gray-400 py-2">本次回测无开单记录</div>
      </Panel>
    );
  }
  const th = "py-1.5 px-2 text-left text-gray-400 font-semibold whitespace-nowrap";
  const td = "py-1.5 px-2 whitespace-nowrap";
  return (
    <Panel title={`开单列表 (${trades.length})`} theme={theme}>
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-[11px]">
          <thead>
            <tr className={`border-b ${theme === "dark" ? "border-[#2a2e39]" : "border-[#e0e3eb]"}`}>
              <th className={th}>#</th>
              <th className={th}>方向</th>
              <th className={th}>开仓时间</th>
              <th className={th}>开仓价</th>
              <th className={th}>平仓时间</th>
              <th className={th}>平仓价</th>
              <th className={th}>持仓 bar</th>
              <th className={th}>毛利</th>
              <th className={th}>净利</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-500/10">
            {trades.map((t, i) => {
              const win = t.net_return >= 0;
              const pnlColor = win ? "text-[#089981]" : "text-[#f23645]";
              return (
                <tr
                  key={i}
                  className={theme === "dark" ? "hover:bg-[#1e222d]" : "hover:bg-gray-50"}
                >
                  <td className={`${td} text-gray-400`}>{i + 1}</td>
                  <td className={`${td} font-bold ${t.side === "long" ? "text-[#089981]" : "text-[#f23645]"}`}>
                    {t.side === "long" ? "多" : "空"}
                  </td>
                  <td className={td}>{fmtTime(t.entry_time)}</td>
                  <td className={td}>{fmtNum(t.entry_price, 6)}</td>
                  <td className={td}>{fmtTime(t.exit_time)}</td>
                  <td className={td}>{fmtNum(t.exit_price, 6)}</td>
                  <td className={td}>{t.bars}</td>
                  <td className={`${td} ${pnlColor}`}>{fmtPct(t.gross_return)}</td>
                  <td className={`${td} font-bold ${pnlColor}`}>{fmtPct(t.net_return)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};
