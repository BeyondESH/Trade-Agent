import { ArrowUpDown, Search } from "lucide-react";
import type React from "react";
import { categoryLabel, type Ticker, type TickerSortKey } from "../../api/types";
import { amplitudeOf, type CategoryTab, useTickerList } from "../../hooks/useTickerList";
import { tickerToSymbolInfo } from "../../hooks/useRealSymbols";
import { t } from "../../lib/i18n";
import type { SymbolInfo } from "../../types/trading";

interface Props {
  symbols: SymbolInfo[];
  onSelectSymbol: (symbol: SymbolInfo) => void;
  theme: "dark" | "light";
}

const CATEGORY_TABS: CategoryTab[] = ["all", "SPOT", "USDT-FUTURES"];

interface Column {
  key: TickerSortKey;
  label: string;
  align?: "right";
}

const COLUMNS: Column[] = [
  { key: "symbol", label: t("Ticker") },
  { key: "price", label: t("Price"), align: "right" },
  { key: "change", label: t("Change %"), align: "right" },
  { key: "funding", label: t("Funding Rate"), align: "right" },
  { key: "mark", label: t("Mark Price"), align: "right" },
  { key: "amplitude", label: t("24h Amplitude"), align: "right" },
  { key: "turnover", label: t("24h Turnover"), align: "right" },
];

const PLACEHOLDER = "--";

function numOrNull(v: string | number | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function formatPrice(v: number | null): string {
  if (v == null) return PLACEHOLDER;
  return v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 6 : 2 });
}

function formatPercent(v: number | null, digits: number): string {
  if (v == null) return PLACEHOLDER;
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function formatCompact(v: number | null): string {
  if (v == null) return PLACEHOLDER;
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(2);
}

function changeOf(tk: Ticker): number | null {
  return numOrNull(tk.change24h ?? tk.price24hPcnt);
}

function turnoverOf(tk: Ticker): number | null {
  return numOrNull(tk.quoteVolume ?? tk.turnover24h);
}

function tabLabel(tab: CategoryTab): string {
  return tab === "all" ? t("All") : categoryLabel(tab);
}

export const ScreenerPanel: React.FC<Props> = ({ symbols, onSelectSymbol, theme }) => {
  const { tickers, search, setSearch, tab, setTab, sortKey, sortDir, setSort } = useTickerList();
  const isDark = theme === "dark";

  const headerClass = `border-b text-gray-500 uppercase text-[10px] font-sans ${
    isDark ? "border-[#2a2e39]" : "border-[#e0e3eb]"
  }`;

  return (
    <div id="screener-tab" className="flex flex-col h-full w-full select-none text-xs">
      {/* Search & Filter Header */}
      <div
        className={`px-3 py-1.5 border-b flex items-center justify-between gap-3 ${
          isDark ? "border-[#2a2e39] bg-[#1e222d]" : "border-[#e0e3eb] bg-[#f0f3fa]"
        }`}
      >
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded border w-full ${
              isDark ? "bg-[#131722] border-[#2a2e39]" : "bg-white border-[#e0e3eb]"
            }`}
          >
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search symbol...")}
              aria-label={t("Ticker")}
              className="bg-transparent outline-none w-full text-xs"
            />
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1">
          {CATEGORY_TABS.map((cat) => (
            <button
              key={cat}
              data-testid={`screener-tab-${cat}`}
              onClick={() => setTab(cat)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                tab === cat
                  ? "bg-[#2962ff] text-white"
                  : isDark
                    ? "text-gray-400 hover:text-white"
                    : "text-gray-600 hover:text-black"
              }`}
            >
              {tabLabel(cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Screener Table */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px]">
        <table className="w-full text-left">
          <thead>
            <tr className={headerClass}>
              {COLUMNS.map((col) => {
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    className={`py-1.5 px-2 ${col.align === "right" ? "text-right" : ""}`}
                  >
                    <button
                      type="button"
                      data-testid={`screener-sort-${col.key}`}
                      onClick={() => setSort(col.key)}
                      className={`inline-flex items-center gap-1 uppercase ${
                        active ? "text-[#2962ff]" : "hover:text-white"
                      }`}
                    >
                      <span>{col.label}</span>
                      {active ? (
                        <span data-testid={`screener-sort-dir-${col.key}`}>
                          {sortDir === "asc" ? "▲" : "▼"}
                        </span>
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-500/10">
            {tickers.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-6 text-center text-gray-500 font-sans">
                  {t("No symbols available")}
                </td>
              </tr>
            ) : (
              tickers.map((tk) => {
                const change = changeOf(tk);
                const funding = numOrNull(tk.fundingRate);
                const amplitude = amplitudeOf(tk);
                const matched =
                  symbols.find((s) => s.id === tk.instId || s.ticker === tk.symbol) ??
                  tickerToSymbolInfo(tk);

                return (
                  <tr
                    key={`${tk.category ?? "USDT-FUTURES"}:${tk.instId}`}
                    data-testid={`screener-row-${tk.instId}`}
                    onClick={() => onSelectSymbol(matched)}
                    className={`cursor-pointer transition-colors ${
                      isDark ? "hover:bg-[#1e222d]" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="py-1.5 px-2 font-bold text-[#2962ff] font-sans">{tk.instId}</td>
                    <td className="py-1.5 px-2 text-right">{formatPrice(numOrNull(tk.lastPr))}</td>
                    <td
                      className={`py-1.5 px-2 text-right font-bold ${
                        change == null
                          ? "text-gray-400"
                          : change >= 0
                            ? "text-[#089981]"
                            : "text-[#f23645]"
                      }`}
                    >
                      {formatPercent(change, 2)}
                    </td>
                    <td
                      className={`py-1.5 px-2 text-right tabular-nums ${
                        funding == null
                          ? "text-gray-400"
                          : funding >= 0
                            ? "text-[#089981]"
                            : "text-[#f23645]"
                      }`}
                    >
                      {formatPercent(funding == null ? null : funding * 100, 4)}
                    </td>
                    <td className="py-1.5 px-2 text-right text-gray-400 tabular-nums">
                      {formatPrice(numOrNull(tk.markPrice))}
                    </td>
                    <td className="py-1.5 px-2 text-right text-gray-400 tabular-nums">
                      {formatPercent(amplitude == null ? null : amplitude * 100, 2)}
                    </td>
                    <td className="py-1.5 px-2 text-right text-gray-400 tabular-nums">
                      {formatCompact(turnoverOf(tk))}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
