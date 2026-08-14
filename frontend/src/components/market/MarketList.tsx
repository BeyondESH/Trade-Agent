import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useRef } from "react";
import type { Ticker, TickerSortKey } from "../../api/types";
import { Input } from "../../ui";

const COLUMNS: { key: TickerSortKey; label: string; align: "left" | "right" }[] = [
  { key: "symbol", label: "合约", align: "left" },
  { key: "price", label: "最新价", align: "right" },
  { key: "change", label: "24h涨跌", align: "right" },
  { key: "volume", label: "24h成交量", align: "right" },
  { key: "turnover", label: "24h成交额", align: "right" },
];

function changeText(p: string | undefined): string {
  const v = p == null ? 0 : Number(p);
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

function volText(v: string | undefined): string {
  if (v == null) return "--";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}

export const MarketRow = memo(function MarketRow({
  t,
  active,
  onSelect,
}: {
  t: Ticker;
  active: boolean;
  onSelect: (symbol: string) => void;
}) {
  const change = t.change24h != null ? Number(t.change24h) : t.price24hPcnt != null ? Number(t.price24hPcnt) : 0;
  const up = change >= 0;
  const color = up ? "text-up" : "text-down";
  return (
    <button
      onClick={() => onSelect(t.instId)}
      className={`grid w-full grid-cols-[1fr_90px_80px_90px_90px] items-center px-2 py-1.5 text-xs ${
        active ? "bg-panel2 text-text" : "text-text hover:bg-panel2/50"
      }`}
      data-testid={`market-row-${t.instId}`}
    >
      <span className="text-left font-semibold">{t.instId}</span>
      <span className={`tnum text-right ${color}`}>{t.lastPr ?? "--"}</span>
      <span className={`tnum text-right ${color}`}>
        {t.change24h != null || t.price24hPcnt != null ? changeText(t.change24h ?? t.price24hPcnt) : "--"}
      </span>
      <span className="tnum text-right text-muted">{volText(t.baseVolume ?? t.volume24h)}</span>
      <span className="tnum text-right text-muted">{volText(t.quoteVolume ?? t.turnover24h)}</span>
    </button>
  );
});

export function MarketList({
  tickers,
  search,
  sortKey,
  sortDir,
  active,
  onSearch,
  onSort,
  onSelect,
}: {
  tickers: Ticker[];
  search: string;
  sortKey: TickerSortKey;
  sortDir: "asc" | "desc";
  active: string;
  onSearch: (q: string) => void;
  onSort: (key: TickerSortKey) => void;
  onSelect: (symbol: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: tickers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 12,
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-2">
        <Input placeholder="搜索合约…" value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      <div className="grid grid-cols-[1fr_90px_80px_90px_90px] px-2 pb-1 text-[10px] text-muted border-b border-border">
        {COLUMNS.map((c) => (
          <button
            key={c.key}
            onClick={() => onSort(c.key)}
            className={`text-left ${c.align === "right" ? "text-right" : ""} hover:text-text`}
            data-testid={`sort-${c.key}`}
          >
            {c.label}
            {sortKey === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
          </button>
        ))}
      </div>
      <div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((vi) => {
            const t = tickers[vi.index];
            return (
              <div
                key={vi.key}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
              >
                <MarketRow t={t} active={t.instId === active} onSelect={onSelect} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
