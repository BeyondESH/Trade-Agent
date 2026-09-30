import { BarChart3 } from "lucide-react";
import type React from "react";
import { useDerivative } from "../../hooks/useDerivative";
import { t } from "../../lib/i18n";
import type { OrderBookEntry, SymbolInfo } from "../../types/trading";

interface Props {
  symbol: SymbolInfo;
  orderBook: {
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
    spread: number | null;
  };
  theme: "dark" | "light";
}

function numOrNull(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export const OrderBookPanel: React.FC<Props> = ({ symbol, orderBook }) => {
  const maxBidTotal = orderBook.bids[orderBook.bids.length - 1]?.total || 1;
  const maxAskTotal = orderBook.asks[orderBook.asks.length - 1]?.total || 1;
  const maxTotal = Math.max(maxBidTotal, maxAskTotal);
  const spreadText = orderBook.spread != null ? orderBook.spread.toFixed(symbol.digits) : "--";

  // Funding rate + mark price from the WS derivative channels; absent → "--".
  const { funding, markPrice } = useDerivative(symbol.ticker, symbol._productCategory);
  const fundingValue = numOrNull(funding?.fundingRate);
  const markValue = numOrNull(markPrice?.markPrice);

  return (
    <div
      id="orderbook-panel"
      className="flex flex-col h-full w-full select-none text-xs bg-surface text-content"
    >
      <div className="p-2.5 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <BarChart3 className="w-4 h-4 text-signal" />
          <span>{t("Order Book (DOM)")}</span>
        </div>
        <span className="text-2xs text-faint font-mono">{t("Precision: 0.01")}</span>
      </div>

      {/* Header */}
      <div className="grid grid-cols-3 px-3 py-1 text-2xs text-faint font-semibold uppercase">
        <div>
          {t("Price")} ({symbol.quoteAsset})
        </div>
        <div className="text-right">
          {t("Size")} ({symbol.baseAsset})
        </div>
        <div className="text-right">{t("Total")}</div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col justify-between font-mono ta-num text-[11px]">
        {/* Asks (Red - reversed top to bottom) */}
        <div className="flex flex-col-reverse justify-end gap-0.5 overflow-hidden">
          {orderBook.asks.slice(0, 10).map((ask, i) => {
            const depthPct = (ask.total / maxTotal) * 100;
            return (
              <div key={i} className="relative grid grid-cols-3 px-3 py-0.5 items-center">
                <div
                  className="absolute right-0 top-0 bottom-0 bg-down/15 pointer-events-none"
                  style={{ width: `${depthPct}%` }}
                />
                <span className="text-down font-semibold">{ask.price.toFixed(symbol.digits)}</span>
                <span className="text-right text-muted">{ask.amount.toFixed(3)}</span>
                <span className="text-right text-faint">{ask.total.toFixed(3)}</span>
              </div>
            );
          })}
        </div>

        {/* Current Mid Price Banner */}
        <div className="py-1.5 px-3 my-1 flex items-center justify-between border-y border-line bg-surface-2 font-bold">
          <span className={`text-sm ${symbol.change24hPercent >= 0 ? "text-up" : "text-down"}`}>
            ${symbol.price.toFixed(symbol.digits)}
          </span>
          <span className="text-2xs text-muted font-normal">
            {t("Spread:")} {spreadText}
          </span>
        </div>

        {/* Bids (Green) */}
        <div className="flex flex-col gap-0.5 overflow-hidden">
          {orderBook.bids.slice(0, 10).map((bid, i) => {
            const depthPct = (bid.total / maxTotal) * 100;
            return (
              <div key={i} className="relative grid grid-cols-3 px-3 py-0.5 items-center">
                <div
                  className="absolute right-0 top-0 bottom-0 bg-up/15 pointer-events-none"
                  style={{ width: `${depthPct}%` }}
                />
                <span className="text-up font-semibold">{bid.price.toFixed(symbol.digits)}</span>
                <span className="text-right text-muted">{bid.amount.toFixed(3)}</span>
                <span className="text-right text-faint">{bid.total.toFixed(3)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Derivative rows: funding rate + mark price (WS source, "--" until data) */}
      <div className="grid grid-cols-2 gap-x-3 px-3 py-1.5 border-t border-line text-2xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-faint">{t("Funding Rate")}</span>
          <span
            data-testid="orderbook-funding"
            className={`font-mono ta-num tabular-nums ${
              fundingValue == null ? "text-muted" : fundingValue >= 0 ? "text-up" : "text-down"
            }`}
          >
            {fundingValue == null
              ? "--"
              : `${fundingValue >= 0 ? "+" : ""}${(fundingValue * 100).toFixed(4)}%`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-faint">{t("Mark Price")}</span>
          <span
            data-testid="orderbook-mark-price"
            className="font-mono ta-num tabular-nums text-content"
          >
            {markValue == null
              ? "--"
              : markValue.toLocaleString("en-US", { maximumFractionDigits: symbol.digits })}
          </span>
        </div>
      </div>
    </div>
  );
};
