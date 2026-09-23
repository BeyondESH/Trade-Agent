import {
  DollarSign,
  OctagonX,
  Plus,
  Power,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { t } from "../../lib/i18n";
import { type AccountState, type Order, type Position, SymbolInfo } from "../../types/trading";

const PLACEHOLDER = "—";

/** A persisted trade-journal row (GET /journal), loosely typed on purpose. */
interface TradeRow {
  id?: string;
  symbol?: string;
  side?: string;
  entry_price?: number | null;
  exit_price?: number | null;
  pnl?: number | null;
  closed_at?: number | null;
  reason?: string;
  reflection?: string;
}

function formatMoney(value: unknown): string {
  if (value == null || value === "") return PLACEHOLDER;
  const n = Number(value);
  if (!Number.isFinite(n)) return PLACEHOLDER;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(value: unknown): string {
  if (value == null || value === "" || value === 0) return PLACEHOLDER;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return PLACEHOLDER;
  return new Date(n).toLocaleString();
}

interface Props {
  account: AccountState;
  positions: Position[];
  orders: Order[];
  onClosePosition: (id: string) => void;
  onCancelOrder: (id: string) => void;
  onOpenOrderModal: (side: "BUY" | "SELL") => void;
  onResetAccount: () => void;
  theme: "dark" | "light";
}

export const TradingPanel: React.FC<Props> = ({
  account,
  positions,
  orders,
  onClosePosition,
  onCancelOrder,
  onOpenOrderModal,
  onResetAccount,
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<"positions" | "orders" | "history" | "account">(
    "positions",
  );
  const isDark = theme === "dark";

  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyRequestedRef = useRef(false);

  // Run-control state sourced from GET /health; toggles follow the backend response.
  const [killSwitch, setKillSwitch] = useState<boolean | null>(null);
  const [liveEnabled] = useState<boolean | null>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((h) => {
        if (!cancelled) setKillSwitch(Boolean(h.kill_switch));
      })
      .catch(() => {
        if (!cancelled) setKillSwitch(null); // backend offline: leave control disabled
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleKillSwitch = useCallback(async () => {
    if (killSwitch == null || controlBusy) return;
    const next = !killSwitch;
    setControlBusy(true);
    setControlError(null);
    try {
      const res = await api.control({ kill_switch: next });
      setKillSwitch(Boolean(res.kill_switch));
    } catch (e) {
      setControlError(e instanceof Error ? e.message : String(e));
    } finally {
      setControlBusy(false);
    }
  }, [killSwitch, controlBusy]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await api.journal();
      setTrades((res.trades ?? []) as unknown as TradeRow[]);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : String(e));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "history" && !historyRequestedRef.current) {
      historyRequestedRef.current = true;
      void loadHistory();
    }
  }, [activeTab, loadHistory]);

  const sideLabel = (side?: string): string => {
    if (side === "long") return t("Long");
    if (side === "short") return t("Short");
    return side || PLACEHOLDER;
  };

  return (
    <div id="trading-panel-tab" className="flex flex-col h-full w-full select-none text-xs">
      {/* Top Account Header Ribbon */}
      <div
        className={`px-4 py-2 border-b flex items-center justify-between flex-wrap gap-4 ${isDark ? "border-[#2a2e39] bg-[#1e222d]" : "border-[#e0e3eb] bg-[#f0f3fa]"}`}
      >
        <div className="flex items-center gap-6">
          <div>
            <div className="text-[10px] text-gray-500 font-semibold uppercase">
              {t("Account Balance")}
            </div>
            <div data-testid="account-balance" className="font-mono font-bold text-sm">
              $
              {account.balance.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-gray-500 font-semibold uppercase">{t("Equity")}</div>
            <div className="font-mono font-bold text-sm text-[#2962ff]">
              $
              {account.equity.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-gray-500 font-semibold uppercase">
              {t("Unrealized P&L")}
            </div>
            <div
              className={`font-mono font-bold text-sm ${
                account.unrealizedPnl >= 0 ? "text-[#089981]" : "text-[#f23645]"
              }`}
            >
              {account.unrealizedPnl >= 0 ? "+" : ""}$
              {account.unrealizedPnl.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-gray-500 font-semibold uppercase">
              {t("Used / Free Margin")}
            </div>
            <div className="font-mono font-bold text-sm">
              ${account.usedMargin.toLocaleString()} / ${account.freeMargin.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Action Buttons + Run Control */}
        <div className="flex items-center gap-2">
          {killSwitch === true && (
            <span
              data-testid="kill-switch-state"
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#f23645]/20 text-[#f23645] font-sans font-semibold uppercase text-[10px] border border-[#f23645]/40"
            >
              <OctagonX className="w-3.5 h-3.5" />
              {t("Trading Halted")}
            </span>
          )}
          <button
            data-testid="kill-switch-toggle"
            onClick={() => void toggleKillSwitch()}
            disabled={killSwitch == null || controlBusy}
            title={killSwitch == null ? t("Run control unavailable") : t("Kill Switch")}
            className={`flex items-center gap-1 px-2 py-1 rounded font-sans font-semibold text-[11px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              killSwitch
                ? "bg-[#f23645] hover:bg-[#d02534] text-white"
                : "bg-[#f23645]/15 hover:bg-[#f23645]/25 text-[#f23645] border border-[#f23645]/40"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{t("Kill Switch")}</span>
          </button>
          {liveEnabled != null && (
            <span className="text-[10px] text-gray-500 font-sans uppercase">
              {t("Live")}: {liveEnabled ? t("Enabled") : t("Disabled")}
            </span>
          )}
          <button
            data-testid="reset-account"
            onClick={onResetAccount}
            title={t("Reset Funds")}
            className="flex items-center gap-1 px-2 py-1 rounded bg-gray-500/15 hover:bg-gray-500/25 text-gray-400 font-sans font-medium text-[11px] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t("Reset Funds")}</span>
          </button>
          <button
            onClick={() => onOpenOrderModal("BUY")}
            className="flex items-center gap-1 px-3 py-1 rounded bg-[#089981] hover:bg-[#067a67] text-white font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("Buy / Long")}</span>
          </button>
          <button
            onClick={() => onOpenOrderModal("SELL")}
            className="flex items-center gap-1 px-3 py-1 rounded bg-[#f23645] hover:bg-[#d02534] text-white font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("Sell / Short")}</span>
          </button>
        </div>
        {controlError && (
          <div className="w-full text-right text-[10px] text-[#f23645] font-sans">
            {t("Run control error:")}
            {controlError}
          </div>
        )}
      </div>

      {/* Sub Tabs */}
      <div
        className={`flex items-center gap-1 px-3 border-b ${isDark ? "border-[#2a2e39] bg-[#131722]" : "border-[#e0e3eb] bg-white"}`}
      >
        {(
          [
            { id: "positions", label: `${t("Positions")} (${positions.length})` },
            { id: "orders", label: `${t("Working Orders")} (${orders.length})` },
            { id: "history", label: t("Trade History") },
            { id: "account", label: t("Broker Summary") },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            data-testid={`trading-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-[#2962ff] text-[#2962ff] font-semibold"
                : isDark
                  ? "border-transparent text-gray-400 hover:text-white"
                  : "border-transparent text-gray-600 hover:text-black"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tables Content */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px]">
        {activeTab === "positions" &&
          (positions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500 font-sans">
              <DollarSign className="w-8 h-8 opacity-20 mb-1" />
              <span>{t("No open positions. Use Buy or Sell above to place paper trade.")}</span>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr
                  className={`border-b text-gray-500 uppercase text-[10px] font-sans ${isDark ? "border-[#2a2e39]" : "border-[#e0e3eb]"}`}
                >
                  <th className="py-1.5 px-2">{t("Symbol")}</th>
                  <th className="py-1.5 px-2">{t("Side")}</th>
                  <th className="py-1.5 px-2">{t("Size")}</th>
                  <th className="py-1.5 px-2">{t("Entry Price")}</th>
                  <th className="py-1.5 px-2">{t("Mark Price")}</th>
                  <th className="py-1.5 px-2">{t("Margin")}</th>
                  <th className="py-1.5 px-2">{t("Take Profit")}</th>
                  <th className="py-1.5 px-2">{t("Stop Loss")}</th>
                  <th className="py-1.5 px-2">{t("Unrealized P&L")}</th>
                  <th className="py-1.5 px-2">{t("Action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-500/10">
                {positions.map((pos) => {
                  const isProfit = pos.unrealizedPnl >= 0;
                  return (
                    <tr key={pos.id} className={isDark ? "hover:bg-[#1e222d]" : "hover:bg-gray-50"}>
                      <td className="py-1.5 px-2 font-bold font-sans">{pos.symbol}</td>
                      <td
                        className={`py-1.5 px-2 font-bold ${pos.side === "LONG" ? "text-[#089981]" : "text-[#f23645]"}`}
                      >
                        {pos.side} {pos.leverage}x
                      </td>
                      <td className="py-1.5 px-2">{pos.amount}</td>
                      <td className="py-1.5 px-2">${pos.entryPrice.toLocaleString()}</td>
                      <td className="py-1.5 px-2">${pos.currentPrice.toLocaleString()}</td>
                      <td className="py-1.5 px-2">${pos.margin.toFixed(2)}</td>
                      <td className="py-1.5 px-2">{pos.tp ? `$${pos.tp}` : "-"}</td>
                      <td className="py-1.5 px-2">{pos.sl ? `$${pos.sl}` : "-"}</td>
                      <td
                        className={`py-1.5 px-2 font-bold ${isProfit ? "text-[#089981]" : "text-[#f23645]"}`}
                      >
                        {isProfit ? "+" : ""}${pos.unrealizedPnl.toFixed(2)} ({isProfit ? "+" : ""}
                        {pos.unrealizedPnlPercent.toFixed(2)}%)
                      </td>
                      <td className="py-1.5 px-2">
                        <button
                          onClick={() => onClosePosition(pos.id)}
                          className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 font-sans font-medium transition-colors"
                        >
                          {t("Market Close")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))}

        {activeTab === "orders" &&
          (orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500 font-sans">
              <span>{t("No pending limit or stop orders.")}</span>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr
                  className={`border-b text-gray-500 uppercase text-[10px] font-sans ${isDark ? "border-[#2a2e39]" : "border-[#e0e3eb]"}`}
                >
                  <th className="py-1.5 px-2">{t("Symbol")}</th>
                  <th className="py-1.5 px-2">{t("Type")}</th>
                  <th className="py-1.5 px-2">{t("Side")}</th>
                  <th className="py-1.5 px-2">{t("Price")}</th>
                  <th className="py-1.5 px-2">{t("Amount")}</th>
                  <th className="py-1.5 px-2">{t("Filled")}</th>
                  <th className="py-1.5 px-2">{t("Action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-500/10">
                {orders.map((ord) => (
                  <tr key={ord.id} className={isDark ? "hover:bg-[#1e222d]" : "hover:bg-gray-50"}>
                    <td className="py-1.5 px-2 font-bold font-sans">{ord.symbol}</td>
                    <td className="py-1.5 px-2">{ord.type}</td>
                    <td
                      className={`py-1.5 px-2 font-bold ${ord.side === "BUY" ? "text-[#089981]" : "text-[#f23645]"}`}
                    >
                      {ord.side}
                    </td>
                    <td className="py-1.5 px-2">${ord.price.toLocaleString()}</td>
                    <td className="py-1.5 px-2">{ord.amount}</td>
                    <td className="py-1.5 px-2">{ord.filled}</td>
                    <td className="py-1.5 px-2">
                      <button
                        onClick={() => onCancelOrder(ord.id)}
                        className="px-2 py-0.5 rounded bg-gray-500/20 hover:bg-gray-500/30 text-gray-400 font-sans"
                      >
                        {t("Cancel")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {activeTab === "history" && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-2 pb-1.5 font-sans">
              <span className="text-gray-500 uppercase text-[10px] font-semibold">
                {t("Trade History")}
              </span>
              <button
                data-testid="history-refresh"
                onClick={() => void loadHistory()}
                disabled={historyLoading}
                className="px-2 py-0.5 rounded bg-gray-500/20 hover:bg-gray-500/30 text-gray-400 font-medium disabled:opacity-50 transition-colors"
              >
                {historyLoading ? t("Loading...") : t("Refresh")}
              </button>
            </div>

            {historyError ? (
              <div className="flex flex-col items-center justify-center h-32 text-[#f23645] font-sans px-4 text-center">
                <span>{t("Trade History unavailable:")}</span>
                <span className="mt-1 text-[10px] opacity-80 break-all">{historyError}</span>
              </div>
            ) : historyLoading && trades.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-500 font-sans">
                {t("Loading trade history...")}
              </div>
            ) : trades.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-500 font-sans">
                {t("No trade history yet.")}
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr
                    className={`border-b text-gray-500 uppercase text-[10px] font-sans ${isDark ? "border-[#2a2e39]" : "border-[#e0e3eb]"}`}
                  >
                    <th className="py-1.5 px-2">{t("Symbol")}</th>
                    <th className="py-1.5 px-2">{t("Side")}</th>
                    <th className="py-1.5 px-2">{t("Entry Price")}</th>
                    <th className="py-1.5 px-2">{t("Exit Price")}</th>
                    <th className="py-1.5 px-2">{t("Profit/Loss")}</th>
                    <th className="py-1.5 px-2">{t("Reason")}</th>
                    <th className="py-1.5 px-2">{t("Close Time")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-500/10">
                  {trades.map((row, i) => {
                    const pnl = row.pnl;
                    const profit = pnl != null && Number(pnl) >= 0;
                    return (
                      <tr
                        key={row.id ?? i}
                        className={isDark ? "hover:bg-[#1e222d]" : "hover:bg-gray-50"}
                      >
                        <td className="py-1.5 px-2 font-bold font-sans">
                          {row.symbol || PLACEHOLDER}
                        </td>
                        <td
                          className={`py-1.5 px-2 font-bold ${row.side === "long" ? "text-[#089981]" : row.side === "short" ? "text-[#f23645]" : ""}`}
                        >
                          {sideLabel(row.side)}
                        </td>
                        <td className="py-1.5 px-2">{formatMoney(row.entry_price)}</td>
                        <td className="py-1.5 px-2">{formatMoney(row.exit_price)}</td>
                        <td
                          className={`py-1.5 px-2 font-bold ${pnl == null ? "" : profit ? "text-[#089981]" : "text-[#f23645]"}`}
                        >
                          {pnl == null ? PLACEHOLDER : `${profit ? "+" : ""}${formatMoney(pnl)}`}
                        </td>
                        <td className="py-1.5 px-2 font-sans text-gray-400">
                          {row.reflection || row.reason || PLACEHOLDER}
                        </td>
                        <td className="py-1.5 px-2 text-gray-400">{formatTime(row.closed_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "account" && (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 font-sans">
            <div
              className={`p-3 rounded-lg border ${isDark ? "bg-[#1e222d] border-[#2a2e39]" : "bg-[#f8fafc] border-[#e0e3eb]"}`}
            >
              <div className="text-gray-500 text-[10px]">{t("Broker")}</div>
              <div className="font-bold text-sm text-[#2962ff]">
                {t("BeyondEther Simulated Paper Broker")}
              </div>
            </div>
            <div
              className={`p-3 rounded-lg border ${isDark ? "bg-[#1e222d] border-[#2a2e39]" : "bg-[#f8fafc] border-[#e0e3eb]"}`}
            >
              <div className="text-gray-500 text-[10px]">{t("Account Currency")}</div>
              <div className="font-bold text-sm">USD ($)</div>
            </div>
            <div
              className={`p-3 rounded-lg border ${isDark ? "bg-[#1e222d] border-[#2a2e39]" : "bg-[#f8fafc] border-[#e0e3eb]"}`}
            >
              <div className="text-gray-500 text-[10px]">{t("Max Leverage")}</div>
              <div className="font-bold text-sm">{t("100x Cross Margin")}</div>
            </div>
            <div
              className={`p-3 rounded-lg border ${isDark ? "bg-[#1e222d] border-[#2a2e39]" : "bg-[#f8fafc] border-[#e0e3eb]"}`}
            >
              <div className="text-gray-500 text-[10px]">{t("Execution Latency")}</div>
              <div className="font-bold text-sm text-[#089981]">{t("Instant (0ms)")}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
