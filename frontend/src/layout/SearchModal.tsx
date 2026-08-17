import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CategoryTab } from "../hooks/useTickerList";
import { useI18n } from "../lib/i18n";
import { SearchIcon } from "../ui/icons";

export interface SearchHit {
  ticker: string;
  market?: string;
  pricePrecision?: number;
  volumePrecision?: number;
}

const TABS: { id: CategoryTab; labelKey: "market.all" | "market.spot" | "market.usdtFutures" | "market.usdcFutures" | "market.coinFutures" | "market.margin" }[] = [
  { id: "all", labelKey: "market.all" },
  { id: "SPOT", labelKey: "market.spot" },
  { id: "USDT-FUTURES", labelKey: "market.usdtFutures" },
  { id: "USDC-FUTURES", labelKey: "market.usdcFutures" },
  { id: "COIN-FUTURES", labelKey: "market.coinFutures" },
  { id: "MARGIN", labelKey: "market.margin" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  searchSymbols: (q: string) => Promise<SearchHit[]>;
  /** Last prices keyed by bare instId (optional enrichment). */
  priceMap?: Record<string, number | undefined>;
  /** Called with `category:instId` (or bare instId when category unknown). */
  onSelect: (composite: string) => void;
}

/** Full-screen symbol search modal (TradingView-style): tabs, table, keyboard nav. */
export function SearchModal({ open, onClose, searchSymbols, priceMap, onSelect }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<CategoryTab>("all");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTab("all");
    setHighlight(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      searchSymbols(query)
        .then(setHits)
        .catch(() => setHits([]));
    }, 120);
    return () => window.clearTimeout(id);
  }, [open, query, searchSymbols]);

  const rows = useMemo(() => {
    const filtered = tab === "all" ? hits : hits.filter((h) => (h.market ?? "") === tab);
    return filtered.slice(0, 100);
  }, [hits, tab]);

  useEffect(() => {
    setHighlight(0);
  }, [rows]);

  const select = useCallback(
    (row: SearchHit) => {
      onSelect(row.market ? `${row.market}:${row.ticker}` : row.ticker);
      onClose();
    },
    [onSelect, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 pt-[12vh]"
      onMouseDown={onClose}
      data-testid="search-modal-mask"
    >
      <div
        className="w-[720px] max-w-[92vw] rounded-modal border border-border bg-panel shadow-float"
        onMouseDown={(e) => e.stopPropagation()}
        data-testid="search-modal"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <SearchIcon size={14} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, Math.max(0, rows.length - 1)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                if (rows[highlight]) select(rows[highlight]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder={t("topbar.search")}
            className="w-full bg-transparent text-sm text-text outline-none"
            data-testid="search-modal-input"
          />
        </div>
        <div className="flex gap-1 border-b border-border px-2 py-1">
          {TABS.map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className={`rounded-chip px-2 py-0.5 text-xs font-medium ${
                tab === x.id ? "bg-active text-text" : "text-muted hover:text-text"
              }`}
              data-testid={`search-tab-${x.id}`}
            >
              {t(x.labelKey)}
            </button>
          ))}
        </div>
        <div className="max-h-[45vh] overflow-auto" data-testid="search-modal-results">
          <div className="grid grid-cols-[2fr_1.2fr_1fr_0.8fr] px-3 py-1 text-[10px] uppercase tracking-wide text-muted">
            <span>{t("watchlist.symbol")}</span>
            <span>{t("search.category")}</span>
            <span className="text-right">{t("watchlist.last")}</span>
            <span className="text-right">{t("search.precision")}</span>
          </div>
          {rows.length === 0 && <div className="px-3 py-4 text-center text-xs text-muted">--</div>}
          {rows.map((r, i) => {
            const price = priceMap?.[r.ticker];
            return (
              <button
                key={`${r.market ?? ""}:${r.ticker}`}
                onClick={() => select(r)}
                onMouseEnter={() => setHighlight(i)}
                className={`grid w-full grid-cols-[2fr_1.2fr_1fr_0.8fr] items-center px-3 py-1.5 text-left ${
                  i === highlight ? "bg-hover" : ""
                }`}
                data-testid={`search-row-${r.market ?? ""}:${r.ticker}`}
              >
                <span className="font-semibold text-text">{r.ticker}</span>
                <span className="text-muted">{r.market ?? ""}</span>
                <span className="tnum text-right text-muted">{price != null ? price.toFixed(2) : "--"}</span>
                <span className="tnum text-right text-muted">{r.pricePrecision ?? "--"}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
