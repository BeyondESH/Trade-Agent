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

export const OrderBookPanel: React.FC<Props> = ({ symbol, orderBook, theme }) => {
  const isDark = theme === "dark";
  const maxBidTotal = orderBook.bids[orderBook.bids.length - 1]?.total || 1;
  const maxAskTotal = orderBook.asks[orderBook.asks.length - 1]?.total || 1;
  const maxTotal = Math.max(maxBidTotal, maxAskTotal);
  const spreadText = orderBook.spread != null ? orderBook.spread.toFixed(symbol.digits) : "--";

  // Funding rate + mark price from the WS derivative channels; absent → "--".
  const { funding, markPrice } = useDerivative(symbol.ticker, symbol._productCategory);
  const fundingValue = numOrNull(funding?.fundingRate);
  const markValue = numOrNull(markPrice?.markPrice);

  return (
    <div id="orderbook-panel" className="flex flex-col h-full w-full select-none text-xs">
      <div
        className={`p-2.5 border-b flex items-center justify-between ${isDark ? "border-[#2a2e39]" : "border-[#e0e3eb]"}`}
      >
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <BarChart3 className="w-4 h-4 text-[#089981]" />
          <span>{t("Order Book (DOM)")}</span>
        </div>
        <span className="text-[10px] text-gray-500 font-mono">{t("Precision: 0.01")}</span>
      </div>

      {/* Header */}
      <div className="grid grid-cols-3 px-3 py-1 text-[10px] text-gray-500 font-semibold uppercase">
        <div>
          {t("Price")} ({symbol.quoteAsset})
        </div>
        <div className="text-right">
          {t("Size")} ({symbol.baseAsset})
        </div>
        <div className="text-right">{t("Total")}</div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col justify-between font-mono text-[11px]">
        {/* Asks (Red - reversed top to bottom) */}
        <div className="flex flex-col-reverse justify-end gap-0.5 overflow-hidden">
          {orderBook.asks.slice(0, 10).map((ask, i) => {
            const depthPct = (ask.total / maxTotal) * 100;
            return (
              <div key={i} className="relative grid grid-cols-3 px-3 py-0.5 items-center">
                <div
                  className="absolute right-0 top-0 bottom-0 bg-[#f23645]/15 pointer-events-none"
                  style={{ width: `${depthPct}%` }}
                />
                <span className="text-[#f23645] font-semibold">
                  {ask.price.toFixed(symbol.digits)}
                </span>
                <span className="text-right text-gray-400">{ask.amount.toFixed(3)}</span>
                <span className="text-right text-gray-500">{ask.total.toFixed(3)}</span>
              </div>
            );
          })}
        </div>

        {/* Current Mid Price Banner */}
        <div
          className={`py-1.5 px-3 my-1 flex items-center justify-between border-y font-bold ${
            isDark ? "bg-[#1e222d] border-[#2a2e39]" : "bg-[#f0f3fa] border-[#e0e3eb]"
          }`}
        >
          <span
            className={`text-sm ${symbol.change24hPercent >= 0 ? "text-[#089981]" : "text-[#f23645]"}`}
          >
            ${symbol.price.toFixed(symbol.digits)}
          </span>
          <span className="text-[10px] text-gray-400 font-normal">
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
                  className="absolute right-0 top-0 bottom-0 bg-[#089981]/15 pointer-events-none"
                  style={{ width: `${depthPct}%` }}
                />
                <span className="text-[#089981] font-semibold">
                  {bid.price.toFixed(symbol.digits)}
                </span>
                <span className="text-right text-gray-400">{bid.amount.toFixed(3)}</span>
                <span className="text-right text-gray-500">{bid.total.toFixed(3)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Derivative rows: funding rate + mark price (WS source, "--" until data) */}
      <div
        className={`grid grid-cols-2 gap-x-3 px-3 py-1.5 border-t text-[10px] ${
          isDark ? "border-[#2a2e39]" : "border-[#e0e3eb]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-500">{t("Funding Rate")}</span>
          <span
            data-testid="orderbook-funding"
            className={`font-mono tabular-nums ${
              fundingValue == null
                ? "text-gray-400"
                : fundingValue >= 0
                  ? "text-[#089981]"
                  : "text-[#f23645]"
            }`}
          >
            {fundingValue == null
              ? "--"
              : `${fundingValue >= 0 ? "+" : ""}${(fundingValue * 100).toFixed(4)}%`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-500">{t("Mark Price")}</span>
          <span data-testid="orderbook-mark-price" className="font-mono tabular-nums text-gray-300">
            {markValue == null
              ? "--"
              : markValue.toLocaleString("en-US", { maximumFractionDigits: symbol.digits })}
          </span>
        </div>
      </div>
    </div>
  );
};
