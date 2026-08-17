import { memo } from "react";
import type { BookLevel } from "../../hooks/useOrderBook";

function maxSize(levels: BookLevel[]): number {
  let m = 0;
  for (const l of levels) if (l.size > m) m = l.size;
  return m || 1;
}

function Row({
  level,
  depth,
  tone,
  precision,
  max,
}: {
  level: BookLevel;
  depth: number;
  tone: "ask" | "bid";
  precision: number;
  max: number;
}) {
  const pct = (depth / max) * 100;
  const color = tone === "ask" ? "text-down" : "text-up";
  return (
    <div className="relative grid grid-cols-[1fr_1fr] px-2 py-0.5 text-xs tnum" data-testid={`book-${tone}`}>
      <div
        className="absolute inset-y-0 right-0"
        style={{ width: `${pct}%`, background: tone === "ask" ? "rgba(242,54,69,0.12)" : "rgba(8,153,129,0.12)" }}
      />
      <span className={`relative ${color}`}>{level.price.toFixed(precision)}</span>
      <span className="relative text-right text-muted">{level.size.toFixed(precision + 1)}</span>
    </div>
  );
}

export const OrderBook = memo(function OrderBook({
  asks,
  bids,
  spread,
  precision = 1,
}: {
  asks: BookLevel[];
  bids: BookLevel[];
  spread: number | null;
  precision?: number;
}) {
  const askMax = maxSize(asks);
  const bidMax = maxSize(bids);
  const askRows = asks.slice(0, 12).reverse();
  const bidRows = bids.slice(0, 12);

  return (
    <div className="flex flex-col h-full min-h-0 text-xs">
      <div className="px-2 py-1.5 border-b border-border text-xs font-semibold text-text uppercase tracking-wide">
        订单簿{spread != null ? ` · 价差 ${spread.toFixed(precision)}` : ""}
      </div>
      <div className="grid grid-cols-[1fr_1fr] px-2 pb-1 text-xs font-medium text-muted">
        <span>价格(USDT)</span>
        <span className="text-right">数量</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {askRows.map((l) => (
          <Row key={`a-${l.price}`} level={l} depth={l.size} tone="ask" precision={precision} max={askMax} />
        ))}
        {spread != null && (
          <div className="flex justify-between px-2 py-1 text-xs text-muted tnum border-y border-border">
            <span>买一 {bids[0]?.price.toFixed(precision) ?? "--"}</span>
            <span>卖一 {asks[0]?.price.toFixed(precision) ?? "--"}</span>
          </div>
        )}
        {bidRows.map((l) => (
          <Row key={`b-${l.price}`} level={l} depth={l.size} tone="bid" precision={precision} max={bidMax} />
        ))}
      </div>
    </div>
  );
});
