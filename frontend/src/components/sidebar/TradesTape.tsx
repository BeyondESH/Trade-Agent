import type React from "react";
import type { Trade } from "../../hooks/useTrades";
import { t } from "../../lib/i18n";

interface Props {
  trades: Trade[];
  precision?: number;
  theme: "dark" | "light";
}

function fmtPrice(p: string, precision: number): string {
  const v = Number(p);
  return Number.isNaN(v) ? p : v.toFixed(precision);
}

function fmtTime(ts: string): string {
  const t = Number(ts);
  if (Number.isNaN(t) || t === 0) return "--:--:--";
  return new Date(t).toTimeString().slice(0, 8);
}

export const TradesTape: React.FC<Props> = ({ trades, precision = 2 }) => {
  return (
    <div className="flex flex-col h-full min-h-0 text-xs bg-surface text-content">
      <div className="px-3 py-1.5 border-b border-line font-semibold text-xs uppercase tracking-wide text-content">
        最新成交
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] px-3 pb-1 text-2xs font-medium uppercase text-faint">
        <span>{t("Price")}</span>
        <span className="text-right">{t("Size")}</span>
        <span className="text-right pl-2">{t("Time")}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto font-mono ta-num text-[11px]">
        {trades.length === 0 && <div className="px-3 py-3 text-center text-muted">暂无成交</div>}
        {trades.map((t, i) => {
          const color = t.side === "buy" ? "text-up" : "text-down";
          return (
            <div
              key={`${t.ts}-${i}`}
              className="grid grid-cols-[1fr_1fr_auto] px-3 py-0.5 items-center"
            >
              <span className={`font-semibold ${color}`}>{fmtPrice(t.price, precision)}</span>
              <span className="text-right text-muted">{t.size}</span>
              <span className="text-right pl-2 text-faint">{fmtTime(t.ts)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
