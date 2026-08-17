import { OrderBook } from "../orderbook/OrderBook";
import { TradesTape } from "../orderbook/TradesTape";
import { FundingRate, MarkPrice } from "../derivative/FundingRate";
import type { OrderBookState } from "../../hooks/useOrderBook";
import type { Trade } from "../../hooks/useTrades";
import type { DerivativeState } from "../../hooks/useDerivative";

interface Props {
  book: OrderBookState;
  trades: Trade[];
  derivative: DerivativeState;
}

/** Right sidebar DOM / order book tab. */
export function DomPanel({ book, trades, derivative }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <OrderBook asks={book.asks} bids={book.bids} spread={book.spread} precision={2} />
      </div>
      <div className="min-h-0 flex-1 border-t border-border">
        <TradesTape trades={trades} precision={2} />
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-border">
        <FundingRate funding={derivative.funding} />
        <MarkPrice markPrice={derivative.markPrice} />
      </div>
    </div>
  );
}
