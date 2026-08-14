import { memo } from "react";
import type { Trade } from "../../hooks/useTrades";

function fmtPrice(p: string, precision: number): string {
  const v = Number(p);
  return Number.isNaN(v) ? p : v.toFixed(precision);
}

function fmtTime(ts: string): string {
  const t = Number(ts);
  if (Number.isNaN(t) || t === 0) return "--:--:--";
  const d = new Date(t);
  return d.toTimeString().slice(0, 8);
}

export const TradesTape = memo(function TradesTape({
  trades,
  precision = 1,
}: {
  trades: Trade[];
  precision?: number;
}) {
  return (
    <div className="flex flex-col h-full min-h-0 text-xs">
      <div className="px-2 py-1 border-b border-border text-[10px] text-muted uppercase tracking-wide">最新成交</div>
      <div className="grid grid-cols-[1fr_1fr_auto] px-2 pb-1 text-[10px] text-muted">
        <span>价格</span>
        <span className="text-right">数量</span>
        <span className="text-right pl-2">时间</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {trades.length === 0 && <div className="px-2 py-3 text-center text-muted">暂无成交</div>}
        {trades.map((t, i) => {
          const color = t.side === "buy" ? "text-up" : "text-down";
          return (
            <div key={`${t.ts}-${i}`} className="grid grid-cols-[1fr_1fr_auto] px-2 py-0.5 text-[11px] tnum">
              <span className={color}>{fmtPrice(t.price, precision)}</span>
              <span className="text-right text-muted">{t.size}</span>
              <span className="text-right pl-2 text-muted">{fmtTime(t.ts)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
