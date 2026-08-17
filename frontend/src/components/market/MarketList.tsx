import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useRef } from "react";
import type { SymbolType, Ticker, TickerSortKey } from "../../api/types";
import { amplitudeOf, symbolKey, type CategoryTab } from "../../hooks/useTickerList";
import { Input } from "../../ui";

const CATEGORY_TABS: { id: CategoryTab; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "SPOT", label: "现货" },
  { id: "USDT-FUTURES", label: "U合约" },
  { id: "USDC-FUTURES", label: "USDC" },
  { id: "COIN-FUTURES", label: "币本位" },
  { id: "MARGIN", label: "杠杆" },
];

const SYMBOL_TYPE_FILTERS: { id: SymbolType | "all"; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "crypto", label: "加密货币" },
  { id: "metal", label: "贵金属" },
  { id: "stock", label: "股票" },
  { id: "commodity", label: "大宗" },
];

function symbolTypeLabel(t: Ticker): string {
  const st = t.symbolType as SymbolType | undefined;
  if (t.isReality === "yes" || st === "stock") return "股票";
  if (st === "metal") return "贵金属";
  if (st === "commodity") return "大宗";
  return t.category ?? "";
}

type Column = { key: TickerSortKey; label: string; align: "left" | "right" };

const BASE_COLUMNS: Column[] = [
  { key: "symbol", label: "合约", align: "left" },
  { key: "price", label: "最新价", align: "right" },
  { key: "change", label: "24h涨跌", align: "right" },
  { key: "volume", label: "24h成交量", align: "right" },
  { key: "turnover", label: "24h成交额", align: "right" },
];

/** Screener "fundamental" columns: Bitget-native dimensions only (no external sources). */
const EXT_COLUMNS: Column[] = [
  { key: "symbol", label: "合约", align: "left" },
  { key: "price", label: "最新价", align: "right" },
  { key: "change", label: "24h涨跌", align: "right" },
  { key: "funding", label: "资金费率", align: "right" },
  { key: "mark", label: "标记价", align: "right" },
  { key: "amplitude", label: "24h振幅", align: "right" },
  { key: "volume", label: "24h成交量", align: "right" },
  { key: "turnover", label: "24h成交额", align: "right" },
];

const BASE_GRID = "grid-cols-[minmax(0,1fr)_90px_80px_90px_90px]";
const EXT_GRID = "grid-cols-[minmax(0,1fr)_90px_80px_84px_90px_78px_90px_90px]";

function changeText(p: string | undefined): string {
  const v = p == null ? 0 : Number(p);
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

function fundingText(v: string | undefined): string {
  if (v == null) return "--";
  const n = Number(v);
  if (Number.isNaN(n)) return "--";
  return `${n > 0 ? "+" : ""}${(n * 100).toFixed(4)}%`;
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
  extended,
  onSelect,
}: {
  t: Ticker;
  active: boolean;
  extended?: boolean;
  onSelect: (symbol: string) => void;
}) {
  const change = t.change24h != null ? Number(t.change24h) : t.price24hPcnt != null ? Number(t.price24hPcnt) : 0;
  const up = change >= 0;
  const color = up ? "text-up" : "text-down";
  const amp = amplitudeOf(t);
  const fundingN = t.fundingRate != null ? Number(t.fundingRate) : null;
  return (
    <button
      onClick={() => onSelect(symbolKey(t.instId, t.category))}
      className={`grid w-full items-center px-2 py-1.5 text-[13px] ${extended ? EXT_GRID : BASE_GRID} ${
        active ? "bg-panel2 text-text" : "text-text hover:bg-panel2/50"
      }`}
      data-testid={`market-row-${t.instId}`}
    >
      <span className="flex items-center gap-1 text-left font-semibold">
        {t.instId}
        {symbolTypeLabel(t) && (
          <span className="rounded-chip bg-panel2 px-1 text-[9px] font-medium text-muted">{symbolTypeLabel(t)}</span>
        )}
      </span>
      <span className={`tnum text-right ${color}`}>{t.lastPr ?? "--"}</span>
      <span className={`tnum text-right ${color}`}>
        {t.change24h != null || t.price24hPcnt != null ? changeText(t.change24h ?? t.price24hPcnt) : "--"}
      </span>
      {extended && (
        <>
          <span
            className="tnum text-right"
            style={{ color: fundingN == null ? "var(--tv-muted)" : fundingN >= 0 ? "var(--tv-up)" : "var(--tv-down)" }}
          >
            {fundingText(t.fundingRate)}
          </span>
          <span className="tnum text-right text-muted">{t.markPrice ?? "--"}</span>
          <span className="tnum text-right text-muted">
            {amp != null ? `${(amp * 100).toFixed(2)}%` : "--"}
          </span>
        </>
      )}
      <span className="tnum text-right text-muted">{volText(t.baseVolume ?? t.volume24h)}</span>
      <span className="tnum text-right text-muted">{volText(t.quoteVolume ?? t.turnover24h)}</span>
    </button>
  );
});

export function MarketList({
  tickers,
  search,
  tab,
  symbolType,
  sortKey,
  sortDir,
  active,
  onSearch,
  onTab,
  onSymbolType,
  onSort,
  onSelect,
  extended = false,
}: {
  tickers: Ticker[];
  search: string;
  tab: CategoryTab;
  symbolType: SymbolType | "all";
  sortKey: TickerSortKey;
  sortDir: "asc" | "desc";
  active: string;
  onSearch: (q: string) => void;
  onTab: (tab: CategoryTab) => void;
  onSymbolType: (t: SymbolType | "all") => void;
  onSort: (key: TickerSortKey) => void;
  onSelect: (symbol: string) => void;
  /** Screener mode: show Bitget-native fundamental columns. */
  extended?: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const columns = extended ? EXT_COLUMNS : BASE_COLUMNS;
  const rowVirtualizer = useVirtualizer({
    count: tickers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 12,
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex gap-1 border-b border-border px-2 py-1">
        {CATEGORY_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className={`px-2 py-0.5 text-xs rounded-chip font-medium ${
              tab === t.id ? "bg-active text-text" : "text-muted hover:text-text"
            }`}
            data-testid={`cat-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1 border-b border-border px-2 py-1">
        {SYMBOL_TYPE_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => onSymbolType(f.id)}
            className={`px-2 py-0.5 text-[11px] rounded-chip ${
              symbolType === f.id ? "bg-active text-text" : "text-muted hover:text-text"
            }`}
            data-testid={`type-filter-${f.id}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="p-2">
        <Input placeholder="搜索合约…" value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      <div
        className={`grid px-2 pb-1 text-xs text-muted border-b border-border ${extended ? EXT_GRID : BASE_GRID}`}
      >
        {columns.map((c) => (
          <button
            key={c.key}
            onClick={() => onSort(c.key)}
            className={`text-left font-medium ${c.align === "right" ? "text-right" : ""} hover:text-text`}
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
                <MarketRow t={t} active={symbolKey(t.instId, t.category) === active} extended={extended} onSelect={onSelect} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
