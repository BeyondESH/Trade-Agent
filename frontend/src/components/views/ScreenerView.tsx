import { ChevronDown, ChevronRight, ChevronUp, Download, Filter, Search } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { compactNumber, formatPercent, formatPrice } from "../../lib/format";
import { t } from "../../lib/i18n";
import type { SymbolInfo, ThemeMode } from "../../types/trading";
import { FlashNumber } from "../ui/flash-number";

/** Escape one CSV field (quote when it contains a comma, quote or newline). */
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Quote turnover as a number for sorting. The backend hands this back as a raw
 * numeric string; instruments with no quote report "-" and must sink to the
 * bottom rather than sorting as zero.
 */
function turnoverOf(symbol: SymbolInfo): number {
  if (!symbol.volume24h || symbol.volume24h === "-") return Number.NEGATIVE_INFINITY;
  const n = Number(symbol.volume24h);
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
}

interface Props {
  symbols: SymbolInfo[];
  onOpenChartWithTicker: (ticker: string) => void;
  theme: ThemeMode;
}

type SortKey = "ticker" | "asset" | "price" | "change" | "turnover" | "high" | "low";
type ColumnKey = SortKey | "category" | "action";
type SortDir = "asc" | "desc";

const PANEL = "flex flex-col rounded-xl border border-line bg-surface shadow-e1";
const SPRING = { type: "spring", stiffness: 380, damping: 30 } as const;
const INSTANT = { duration: 0 } as const;

/** Fallback row height, until the real one is measured off the first row. */
const ROW_H = 37;
/** Rows mounted beyond the viewport on each side, to hide scroll seams. */
const OVERSCAN = 10;

export const ScreenerView: React.FC<Props> = ({ symbols, onOpenChartWithTicker }) => {
  const reduce = useReducedMotion();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  // Default to turnover, descending. The exchange lists thousands of
  // instruments, and an alphabetical default opens the screener on obscure
  // listings instead of the ones a trader is actually looking for.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "turnover",
    dir: "desc",
  });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // --- Row windowing ---------------------------------------------------------
  // The exchange lists thousands of instruments. Mounting every row blocked the
  // main thread for seconds (measured: 4.8s to first paint, 548ms per frame at
  // 46k DOM nodes), which froze the whole terminal. Only the visible slice is
  // mounted; spacer rows keep the scrollbar honest.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(640);
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

  // Self-correcting: read the real row height off the DOM and re-window if the
  // styling ever changes, rather than trusting hard-coded arithmetic.
  useEffect(() => {
    const row = scrollRef.current?.querySelector<HTMLTableRowElement>("tbody tr[data-idx]");
    if (!row) return;
    const h = row.getBoundingClientRect().height;
    if (h > 8 && Math.abs(h - rowHRef.current) > 0.5) {
      rowHRef.current = h;
      remeasure((n) => n + 1);
    }
  });

  // A new filter or sort is a new result set: return to the top.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    setScrollTop(0);
  }, [search, selectedCategory, sort]);

  const categories = useMemo(() => {
    const set = new Set<string>(["All"]);
    for (const s of symbols) set.add(s.exchange);
    return [...set];
  }, [symbols]);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return symbols.filter((s) => {
      const matchesSearch =
        !q || s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
      const matchesCat = selectedCategory === "All" || s.exchange === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [symbols, search, selectedCategory]);

  const sortedItems = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filteredItems].sort((a, b) => {
      switch (sort.key) {
        case "ticker":
          return a.id.localeCompare(b.id) * dir;
        case "asset":
          return a.name.localeCompare(b.name) * dir;
        case "price":
          return (a.price - b.price) * dir;
        case "change":
          return (a.change24hPercent - b.change24hPercent) * dir;
        case "turnover":
          return (turnoverOf(a) - turnoverOf(b)) * dir;
        case "high":
          return ((a.high24h ?? -Infinity) - (b.high24h ?? -Infinity)) * dir;
        case "low":
          return ((a.low24h ?? -Infinity) - (b.low24h ?? -Infinity)) * dir;
      }
      return 0;
    });
  }, [filteredItems, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  };

  const total = sortedItems.length;
  const rowH = rowHRef.current;
  const windowStart = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const windowEnd = Math.min(total, Math.ceil((scrollTop + viewportH) / rowH) + OVERSCAN);
  const visibleItems = sortedItems.slice(windowStart, windowEnd);
  const topPad = windowStart * rowH;
  const bottomPad = Math.max(0, (total - windowEnd) * rowH);

  const handleExportCsv = () => {
    if (typeof URL?.createObjectURL !== "function") return;
    const header = [
      "Ticker",
      "Asset",
      "Category",
      "Price",
      "Change %",
      "24h Turnover",
      "24h High",
      "24h Low",
    ];
    // Export what the user is actually looking at: the filtered AND sorted rows.
    const rows = sortedItems.map((item) => [
      item.id,
      item.name,
      item.exchange,
      String(item.price),
      String(item.change24hPercent),
      item.volume24h ?? "",
      item.high24h != null ? String(item.high24h) : "",
      item.low24h != null ? String(item.low24h) : "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "screener.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const columns: { key: ColumnKey; label: string; align: "left" | "right"; sortable: boolean }[] = [
    { key: "ticker", label: t("Ticker"), align: "left", sortable: true },
    { key: "asset", label: t("Asset"), align: "left", sortable: true },
    { key: "category", label: t("Category"), align: "left", sortable: false },
    { key: "price", label: t("Price"), align: "right", sortable: true },
    { key: "change", label: t("Change %"), align: "right", sortable: true },
    { key: "turnover", label: t("24h Turnover"), align: "right", sortable: true },
    { key: "high", label: "24h High", align: "right", sortable: true },
    { key: "low", label: "24h Low", align: "right", sortable: true },
    { key: "action", label: t("Action"), align: "right", sortable: false },
  ];

  return (
    <div
      id="screener-view"
      className="flex h-full flex-1 select-none flex-col overflow-hidden bg-ink font-sans text-content"
    >
      {/* Command header */}
      <header className="ta-glass z-20 flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-3">
        <div className="min-w-0">
          <h1 className="ta-display flex items-center gap-2 text-base tracking-tight text-content">
            <Filter className="h-4 w-4 text-signal" />
            {t("Screener 2.0 (Multi-Asset Engine)")}
          </h1>
          <p className="mt-0.5 hidden text-xs text-muted sm:block">
            Filter 50,000+ global assets by technical indicators, valuation multiples, and price
            momentum.
          </p>
        </div>
        <button
          type="button"
          data-testid="screener-export-csv"
          onClick={handleExportCsv}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-line-strong hover:text-content"
        >
          <Download className="h-3.5 w-3.5" />
          {t("Export CSV")}
        </button>
      </header>

      {/* Sticky filter bar - stays put while the rows scroll */}
      <div className="ta-glass sticky top-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-2.5">
        <div className="flex min-w-[200px] flex-1 items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticker, name..."
              className="w-full rounded-md border border-line bg-ink py-1.5 pl-8 pr-2.5 text-xs text-content outline-none placeholder:text-faint focus:border-signal"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-md border border-line bg-ink px-2.5 py-1.5 text-xs text-content outline-none focus:border-signal"
          >
            <option value="All">{t("All Categories")}</option>
            {categories
              .filter((c) => c !== "All")
              .map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
          </select>
        </div>
        <span className="ta-num rounded-full border border-line bg-surface-2 px-2.5 py-1 text-2xs font-semibold text-muted">
          {filteredItems.length} assets
        </span>
      </div>

      {/* Instrument list */}
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className={`${PANEL} min-h-0 flex-1 overflow-hidden`}>
          <div
            ref={scrollRef}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            className="min-h-0 flex-1 overflow-auto"
          >
            <table className="ta-num w-full text-left text-xs">
              <thead>
                <tr className="ta-eyebrow text-faint">
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      className={`sticky top-0 z-10 border-b border-line bg-ink px-3 py-2.5 ${
                        c.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {c.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key as SortKey)}
                          className={`inline-flex items-center gap-1 transition-colors hover:text-content ${
                            c.align === "right" ? "flex-row-reverse" : ""
                          }`}
                        >
                          <span>{c.label}</span>
                          <span className="inline-flex h-3 w-3 items-center justify-center">
                            {sort.key === c.key && (
                              <motion.span
                                layoutId="screener-sort-caret"
                                transition={reduce ? INSTANT : SPRING}
                                className="inline-flex"
                              >
                                {sort.dir === "asc" ? (
                                  <ChevronUp className="h-3 w-3 text-signal" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-signal" />
                                )}
                              </motion.span>
                            )}
                          </span>
                        </button>
                      ) : (
                        <span>{c.label}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {topPad > 0 && (
                  <tr style={{ height: topPad }}>
                    <td colSpan={columns.length} className="p-0" />
                  </tr>
                )}
                {visibleItems.map((item, i) => {
                  const isUp = item.change24hPercent >= 0;
                  const hovered = hoveredId === item.id;
                  return (
                    <motion.tr
                      key={item.id}
                      data-idx={windowStart + i}
                      onClick={() => onOpenChartWithTicker(item.id)}
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId((c) => (c === item.id ? null : c))}
                      className="group cursor-pointer transition-colors hover:bg-surface-2/60"
                    >
                      <td className="px-3 py-2.5 font-semibold text-content">{item.id}</td>
                      <td className="px-3 py-2.5 text-muted">{item.name}</td>
                      <td className="px-3 py-2.5">
                        <span className="rounded border border-line/70 bg-surface-2 px-1.5 py-0.5 text-2xs text-muted">
                          {item.exchange}
                        </span>
                      </td>
                      <td className="min-w-[11ch] px-3 py-2.5 text-right font-semibold text-content">
                        <FlashNumber
                          value={item.price}
                          format={(v) => `$${formatPrice(v, item.digits)}`}
                        />
                      </td>
                      <td
                        className={`ta-num min-w-[10ch] px-3 py-2.5 text-right font-semibold ${isUp ? "text-up" : "text-down"}`}
                      >
                        {formatPercent(item.change24hPercent)}
                      </td>
                      <td className="ta-num min-w-[11ch] px-3 py-2.5 text-right text-muted">
                        {compactNumber(item.volume24h)}
                      </td>
                      <td className="ta-num min-w-[11ch] px-3 py-2.5 text-right text-muted">
                        {item.high24h ? formatPrice(item.high24h, item.digits) : "\u2014"}
                      </td>
                      <td className="ta-num min-w-[11ch] px-3 py-2.5 text-right text-muted">
                        {item.low24h ? formatPrice(item.low24h, item.digits) : "\u2014"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <AnimatePresence>
                          {hovered && (
                            <motion.button
                              type="button"
                              initial={{ opacity: 0, x: 8, scale: 0.96 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              exit={{ opacity: 0, x: 8, scale: 0.96 }}
                              transition={
                                reduce ? INSTANT : { type: "spring", stiffness: 420, damping: 30 }
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenChartWithTicker(item.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-md bg-signal px-2.5 py-1 text-xs font-semibold text-signal-ink hover:bg-signal/90"
                            >
                              {t("Open")}
                              <ChevronRight className="h-3 w-3" />
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </td>
                    </motion.tr>
                  );
                })}
                {bottomPad > 0 && (
                  <tr style={{ height: bottomPad }}>
                    <td colSpan={columns.length} className="p-0" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
