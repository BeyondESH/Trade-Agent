import React, { useCallback, useEffect, useState } from "react";
import { ThemeMode } from "../../../types/trading";
import type { Portfolio } from "../../../api/types";
import { api } from "../../../api/client";
import { Panel, btnCls, cardCls, fmtNum } from "./ui";

interface Props {
  theme: ThemeMode;
}

interface TradeRow {
  id?: string;
  symbol?: string;
  side?: string;
  pnl?: number;
  pnl_percent?: number;
  entry_price?: number;
  exit_price?: number;
  leverage?: number;
  closed_at?: number;
  reflection?: string;
}

/** Portfolio equity/positions + trade journal. */
export const PortfolioPanel: React.FC<Props> = ({ theme }) => {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, j] = await Promise.all([api.portfolio(), api.journal()]);
      setPortfolio(p);
      setTrades(j.trades as TradeRow[]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Panel
      title="组合与日志"
      theme={theme}
      right={
        <button onClick={refresh} disabled={loading} className={btnCls(theme, "ghost")}>
          {loading ? "刷新中..." : "刷新"}
        </button>
      }
    >
      {error && <span className="text-xs text-[#f23645]">✕ {error}</span>}
      {portfolio && (
        <div className="grid grid-cols-3 gap-2.5">
          <div className={`${cardCls(theme)} p-3 flex flex-col gap-1`}>
            <span className="text-[11px] font-semibold text-gray-400">权益</span>
            <span className="font-mono font-bold">${fmtNum(portfolio.equity)}</span>
          </div>
          <div className={`${cardCls(theme)} p-3 flex flex-col gap-1`}>
            <span className="text-[11px] font-semibold text-gray-400">峰值权益</span>
            <span className="font-mono font-bold">${fmtNum(portfolio.peak_equity)}</span>
          </div>
          <div className={`${cardCls(theme)} p-3 flex flex-col gap-1`}>
            <span className="text-[11px] font-semibold text-gray-400">持仓数</span>
            <span className="font-mono font-bold">{Object.keys(portfolio.positions).length}</span>
          </div>
        </div>
      )}
      {Object.keys(portfolio?.positions ?? {}).length > 0 && (
        <div className="flex flex-col gap-1.5 text-xs font-mono">
          {Object.entries(portfolio!.positions).map(([sym, pos]) => (
            <div key={sym} className={`${cardCls(theme)} p-2.5 flex justify-between`}>
              <span className="font-semibold">{sym}</span>
              <span className="text-gray-400">{JSON.stringify(pos)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className={`w-full text-xs ${theme === "dark" ? "text-[#d1d4dc]" : "text-[#131722]"}`}>
          <thead>
            <tr className={`border-b ${theme === "dark" ? "border-[#2a2e39]" : "border-[#e0e3eb]"}`}>
              <th className="px-2 py-1 text-left font-semibold">标的</th>
              <th className="px-2 py-1 text-left font-semibold">方向</th>
              <th className="px-2 py-1 text-left font-semibold">开仓价</th>
              <th className="px-2 py-1 text-left font-semibold">平仓价</th>
              <th className="px-2 py-1 text-left font-semibold">盈亏</th>
              <th className="px-2 py-1 text-left font-semibold">原因</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-2 text-gray-500">
                  暂无交易记录。
                </td>
              </tr>
            )}
            {trades.slice(0, 50).map((t, i) => (
              <tr key={t.id ?? i} className={`border-b ${theme === "dark" ? "border-[#2a2e39]/60" : "border-[#e0e3eb]/60"}`}>
                <td className="px-2 py-1 font-mono">{t.symbol ?? "—"}</td>
                <td className="px-2 py-1">{t.side ?? "—"}</td>
                <td className="px-2 py-1 font-mono">{t.entry_price != null ? fmtNum(t.entry_price) : "—"}</td>
                <td className="px-2 py-1 font-mono">{t.exit_price != null ? fmtNum(t.exit_price) : "—"}</td>
                <td className={`px-2 py-1 font-mono ${(t.pnl ?? 0) >= 0 ? "text-[#089981]" : "text-[#f23645]"}`}>
                  {t.pnl != null ? `$${fmtNum(t.pnl)}` : "—"}
                </td>
                <td className="px-2 py-1 text-gray-400">{t.reflection ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};
