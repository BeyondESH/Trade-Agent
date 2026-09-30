import { Flame, TrendingDown, TrendingUp, Zap } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import type { SymbolInfo } from "../../types/trading";

interface Props {
  symbols: SymbolInfo[];
  onSelectSymbol: (s: SymbolInfo) => void;
  theme: "dark" | "light";
}

/** Fallback row height, until the real one is measured off the first row. */
const ROW_H = 48;
/** Rows mounted beyond the viewport on each side, to hide scroll seams. */
const OVERSCAN = 6;

export const HotlistsPanel: React.FC<Props> = ({ symbols, onSelectSymbol }) => {
  const [tab, setTab] = useState<"gainers" | "losers" | "volume">("gainers");

  const sortedList = useMemo(
    () =>
      [...symbols].sort((a, b) => {
        if (tab === "gainers") return b.change24hPercent - a.change24hPercent;
        if (tab === "losers") return a.change24hPercent - b.change24hPercent;
        return parseFloat(b.volume24h) - parseFloat(a.volume24h);
      }),
    [symbols, tab],
  );

  // --- Row windowing ---------------------------------------------------------
  // Sorting thousands of instruments and mounting every row put ~27k nodes on
  // the chart view's dock. Only the visible slice is mounted; the memo above
  // matters because scrolling re-renders on every frame.
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

  // children[1] is the first row: children[0] is the top spacer.
  useEffect(() => {
    const row = scrollRef.current?.children[1] as HTMLElement | undefined;
    if (!row) return;
    const h = row.getBoundingClientRect().height;
    if (h > 8 && Math.abs(h - rowHRef.current) > 0.5) {
      rowHRef.current = h;
      remeasure((n) => n + 1);
    }
  });

  // A tab switch is a new ranking: return to the top.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    setScrollTop(0);
  }, [tab]);

  const total = sortedList.length;
  const rowH = rowHRef.current;
  const windowStart = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const windowEnd = Math.min(total, Math.ceil((scrollTop + viewportH) / rowH) + OVERSCAN);
  const visibleList = sortedList.slice(windowStart, windowEnd);
  const topPad = windowStart * rowH;
  const bottomPad = Math.max(0, (total - windowEnd) * rowH);

  return (
    <div
      id="hotlists-panel"
      className="flex flex-col h-full w-full select-none text-xs bg-surface text-content"
    >
      <div className="p-2.5 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <Flame className="w-4 h-4 text-signal" />
          <span>{t("Market Hotlists")}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-1 border-b border-line bg-ink">
        {[
          { id: "gainers", label: "Top Gainers", icon: TrendingUp },
          { id: "losers", label: "Top Losers", icon: TrendingDown },
          { id: "volume", label: "Volume", icon: Zap },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors flex items-center justify-center gap-1 ${
              tab === t.id ? "bg-signal text-signal-ink" : "text-muted hover:text-content"
            }`}
          >
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* List */}
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="flex-1 overflow-y-auto divide-y divide-line/60"
      >
        <div style={{ height: topPad }} />
        {visibleList.map((s) => {
          const isUp = s.change24hPercent >= 0;
          return (
            <div
              key={s.id}
              onClick={() => onSelectSymbol(s)}
              className="p-3 flex items-center justify-between cursor-pointer transition-colors hover:bg-surface-2/50"
            >
              <div>
                <div className="font-bold text-xs">{s.ticker}</div>
                <div className="text-2xs text-muted">{s.exchange}</div>
              </div>
              <div className="text-right font-mono ta-num">
                <div className="min-w-[8ch] font-bold text-xs">${s.price.toFixed(s.digits)}</div>
                <div
                  className={`min-w-[7.5ch] text-2xs font-bold ${isUp ? "text-up" : "text-down"}`}
                >
                  {isUp ? "+" : ""}
                  {s.change24hPercent.toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ height: bottomPad }} />
      </div>
    </div>
  );
};
