import { memo } from "react";
import type { Ticker } from "../../api/types";

function priceClass(p: string | undefined): string {
  if (!p) return "text-muted";
  const v = Number(p);
  if (Number.isNaN(v)) return "text-muted";
  return v >= 0 ? "text-up" : "text-down";
}

function changeClass(p: string | undefined): string {
  const v = p == null ? 0 : Number(p);
  return v >= 0 ? "text-up" : "text-down";
}

export const TickerItem = memo(function TickerItem({
  t,
  active,
  onSelect,
}: {
  t: Ticker;
  active: boolean;
  onSelect: (symbol: string) => void;
}) {
  const change = t.change24h != null ? Number(t.change24h) : t.price24hPcnt != null ? Number(t.price24hPcnt) : 0;
  return (
    <button
      onClick={() => onSelect(t.instId)}
      className={`shrink-0 flex flex-col items-start px-3 py-1.5 border-r border-border text-left transition ${
        active ? "bg-panel2" : "hover:bg-panel2/50"
      }`}
      data-testid={`ticker-${t.instId}`}
    >
      <span className="text-xs font-semibold text-text">{t.instId}</span>
      <span className={`tnum text-xs ${priceClass(t.lastPr)}`}>{t.lastPr ?? "--"}</span>
      <span className={`tnum text-[10px] ${changeClass(t.price24hPcnt)}`}>
        {change > 0 ? "+" : ""}
        {(change * 100).toFixed(2)}%
      </span>
    </button>
  );
});

export function TickerBar({
  tickers,
  active,
  onSelect,
}: {
  tickers: Ticker[];
  active: string;
  onSelect: (symbol: string) => void;
}) {
  return (
    <div className="flex h-14 border-b border-border bg-panel overflow-x-auto">
      {tickers.map((t) => (
        <TickerItem key={t.instId} t={t} active={t.instId === active} onSelect={onSelect} />
      ))}
    </div>
  );
}
