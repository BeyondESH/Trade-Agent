import type React from "react";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import type { SymbolInfo } from "../../types/trading";

interface Props {
  symbols: SymbolInfo[];
  activeSymbolId?: string;
  /** True while the realtime feed is delivering quotes. */
  live: boolean;
  onSelectSymbol: (symbol: SymbolInfo) => void;
}

/** Price at the symbol's own precision; em dash until the first quote lands. */
function formatPrice(value: number, digits: number): string {
  if (!Number.isFinite(value) || value <= 0) return "\u2014";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatChange(value: number): string {
  if (!Number.isFinite(value)) return "\u2014";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/**
 * The market tape: a persistent instrument ribbon under the title bar.
 *
 * It is the terminal's signature - one always-visible read of the market's
 * pulse, built from the same quote feed the rest of the app uses. Deliberately
 * NOT an auto-scrolling marquee: a tape you can scan and scroll, so it reads as
 * instrumentation rather than decoration. Hidden on narrow screens, where the
 * vertical budget is better spent on the workspace.
 */
export const MarketTape: React.FC<Props> = ({ symbols, activeSymbolId, live, onSelectSymbol }) => {
  return (
    <div
      id="market-tape"
      data-testid="market-tape"
      className="hidden md:flex h-7 flex-none select-none items-stretch overflow-hidden border-b border-line bg-surface/60"
    >
      {/* Feed state marker */}
      <div className="flex flex-none items-center gap-1.5 border-r border-line px-2.5">
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 rounded-full", live ? "animate-pulse bg-up" : "bg-faint")}
        />
        <span className={cn("ta-eyebrow", live ? "text-up" : "text-faint")}>
          {live ? t("Live") : t("Offline")}
        </span>
      </div>

      {symbols.length === 0 ? (
        <div className="flex items-center px-3 ta-eyebrow text-faint">
          {t("No symbols available")}
        </div>
      ) : (
        <div className="ta-fade-x no-scrollbar flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {symbols.map((symbol) => {
            const up = symbol.change24hPercent >= 0;
            const isActive = symbol.id === activeSymbolId;
            return (
              <button
                key={symbol.id}
                type="button"
                onClick={() => onSelectSymbol(symbol)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "relative flex flex-none items-center gap-2 border-r border-line/60 px-3 transition-colors",
                  isActive ? "bg-surface-2" : "hover:bg-surface-2/60",
                )}
              >
                <span className={cn("ta-eyebrow", isActive ? "text-content" : "text-muted")}>
                  {symbol.baseAsset}
                  <span className="text-faint">/{symbol.quoteAsset}</span>
                </span>
                <span className="ta-num min-w-[8.5ch] text-xs font-semibold text-content">
                  {formatPrice(symbol.price, symbol.digits)}
                </span>
                <span
                  className={cn(
                    "ta-num min-w-[7.5ch] text-2xs font-semibold",
                    up ? "text-up" : "text-down",
                  )}
                >
                  {formatChange(symbol.change24hPercent)}
                </span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-signal"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
