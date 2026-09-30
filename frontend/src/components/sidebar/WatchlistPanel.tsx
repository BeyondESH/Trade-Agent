import {
  Activity,
  ChevronDown,
  MoreVertical,
  Plus,
  Search,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import type { SymbolInfo } from "../../types/trading";

interface Props {
  symbols: SymbolInfo[];
  activeSymbol: SymbolInfo;
  onSelectSymbol: (symbol: SymbolInfo) => void;
  onAddSymbol: () => void;
  theme: "dark" | "light";
}

/** Fallback row height, until the real one is measured off the first row. */
const ROW_H = 48;
/** Rows mounted beyond the viewport on each side, to hide scroll seams. */
const OVERSCAN = 6;

export const WatchlistPanel: React.FC<Props> = ({
  symbols,
  activeSymbol,
  onSelectSymbol,
  onAddSymbol,
}) => {
  const [activeTab, setActiveTab] = useState<"All" | "Crypto" | "Stocks" | "Forex">("All");

  const filteredSymbols = useMemo(
    () =>
      symbols.filter((s) => {
        if (activeTab === "All") return true;
        if (activeTab === "Crypto") return s.category === "crypto";
        if (activeTab === "Stocks") return s.category === "stocks";
        if (activeTab === "Forex") return s.category === "forex" || s.category === "commodities";
        return true;
      }),
    [symbols, activeTab],
  );

  // --- Row windowing ---------------------------------------------------------
  // The exchange lists thousands of instruments and this dock mounts on the
  // DEFAULT view, so rendering every row put ~35k nodes on screen. Only the
  // visible slice is mounted. Memoising the filter above matters: scrolling
  // re-renders on every frame, and re-filtering the full list each time was the
  // other half of the cost.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);
  const rowHRef = useRef(ROW_H);
  const [, remeasure] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sync = () => setViewportH(el.clientHeight);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Read the real row height off the DOM, so the arithmetic stays correct if the
  // row styling ever changes.
  useEffect(() => {
    const row = scrollRef.current?.querySelector<HTMLElement>("[data-row]");
    if (!row) return;
    const h = row.getBoundingClientRect().height;
    if (h > 8 && Math.abs(h - rowHRef.current) > 0.5) {
      rowHRef.current = h;
      remeasure((n) => n + 1);
    }
  });

  // A category switch is a new result set: return to the top.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    setScrollTop(0);
  }, [activeTab]);

  const total = filteredSymbols.length;
  const rowH = rowHRef.current;
  const windowStart = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const windowEnd = Math.min(total, Math.ceil((scrollTop + viewportH) / rowH) + OVERSCAN);
  const visibleSymbols = filteredSymbols.slice(windowStart, windowEnd);
  const topPad = windowStart * rowH;
  const bottomPad = Math.max(0, (total - windowEnd) * rowH);

  return (
    <div
      id="watchlist-panel"
      className="flex flex-col h-full w-full select-none text-xs bg-surface text-content"
    >
      {/* Watchlist Header */}
      <div className="p-2.5 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-sm text-content">
          <span>{t("Watchlist")}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted" />
        </div>
        <div className="flex items-center gap-1">
          <button
            id="watchlist-add-symbol-btn"
            onClick={onAddSymbol}
            className="rounded-md p-1 text-signal hover:bg-signal/10 transition-colors"
            title={t("Add Symbol")}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1 p-1.5 border-b border-line bg-ink">
        {(["All", "Crypto", "Stocks", "Forex"] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              activeTab === cat
                ? "bg-signal text-signal-ink"
                : "text-muted hover:text-content hover:bg-surface-2"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Symbol List Table */}
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="flex-1 overflow-y-auto divide-y divide-line/60"
      >
        <div style={{ height: topPad }} />
        {visibleSymbols.map((s) => {
          const isSelected = s.id === activeSymbol.id;
          const isUp = s.change24hPercent >= 0;

          return (
            <div
              key={s.id}
              data-row="1"
              onClick={() => onSelectSymbol(s)}
              className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                isSelected ? "bg-surface-2 border-l-2 border-signal" : "hover:bg-surface-2/50"
              }`}
            >
              {/* Left ticker */}
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-xs">{s.ticker}</span>
                  <span className="text-2xs text-faint uppercase">{s.exchange}</span>
                </div>
                <span className="text-2xs text-muted truncate max-w-[120px]">{s.name}</span>
              </div>

              {/* Right price and change */}
              <div className="flex flex-col items-end">
                <span className="font-mono ta-num min-w-[8.5ch] font-bold text-xs">
                  {s.price.toLocaleString(undefined, {
                    minimumFractionDigits: s.digits,
                    maximumFractionDigits: s.digits,
                  })}
                </span>
                <span
                  className={`font-mono ta-num min-w-[8ch] text-center text-2xs font-semibold px-1 py-0.2 rounded ${
                    isUp ? "text-up bg-up/10" : "text-down bg-down/10"
                  }`}
                >
                  {isUp ? "+" : ""}
                  {s.change24hPercent.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
        <div style={{ height: bottomPad }} />
      </div>

      {/* Bottom Symbol Detail Snapshot */}
      <div className="p-3 border-t border-line flex flex-col gap-2 bg-ink">
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm">{activeSymbol.ticker}</span>
          <span
            className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
              activeSymbol.technicalRating === "Strong Buy" ||
              activeSymbol.technicalRating === "Buy"
                ? "bg-up/20 text-up"
                : activeSymbol.technicalRating === "Strong Sell" ||
                    activeSymbol.technicalRating === "Sell"
                  ? "bg-down/20 text-down"
                  : "bg-surface-2 text-muted"
            }`}
          >
            {activeSymbol.technicalRating || t("Neutral")}
          </span>
        </div>

        {/* Day Range Bar */}
        <div className="flex flex-col gap-1 text-2xs text-muted">
          <div className="flex justify-between">
            <span>{t("Day Range")}</span>
            <span className="font-mono ta-num min-w-[17ch]">
              {activeSymbol.low24h.toFixed(activeSymbol.digits)} -{" "}
              {activeSymbol.high24h.toFixed(activeSymbol.digits)}
            </span>
          </div>
          <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden relative">
            <div
              className="h-full bg-signal rounded-full"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    10,
                    ((activeSymbol.price - activeSymbol.low24h) /
                      (activeSymbol.high24h - activeSymbol.low24h || 1)) *
                      100,
                  ),
                )}%`,
              }}
            />
          </div>
        </div>

        {/* 52W Range & Market Cap */}
        <div className="grid grid-cols-2 gap-2 text-2xs text-muted pt-1">
          <div>
            <div className="text-faint">{t("24h Volume")}</div>
            <div className="font-semibold font-mono ta-num min-w-[7ch] text-content">
              {activeSymbol.volume24h}
            </div>
          </div>
          <div>
            <div className="text-faint">{t("Market Cap")}</div>
            <div className="font-semibold font-mono ta-num min-w-[7ch] text-content">
              {activeSymbol.marketCap || "N/A"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
