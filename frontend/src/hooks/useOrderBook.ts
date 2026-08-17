import { useCallback, useState } from "react";
import { useExchangeSocket } from "./useExchangeSocket";

export interface BookLevel {
  price: number;
  size: number;
}

export interface OrderBookState {
  asks: BookLevel[];
  bids: BookLevel[];
  seq: number | null;
  spread: number | null;
}

export const EMPTY_BOOK: OrderBookState = { asks: [], bids: [], seq: null, spread: null };

function mergeInto(levels: Map<number, number>, rows: unknown[]): void {
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const price = Number(row[0]);
    const size = Number(row[1]);
    if (size <= 0) {
      levels.delete(price);
    } else {
      levels.set(price, size);
    }
  }
}

/** Full-depth order book with snapshot + incremental merge. */
export function useOrderBook(symbol: string, category = "USDT-FUTURES"): OrderBookState {
  const [book, setBook] = useState<OrderBookState>(EMPTY_BOOK);

  const apply = useCallback(
    (rows: { asks?: unknown[]; bids?: unknown[]; seq?: number | null }) => {
      setBook((prev) => {
        const asks = new Map<number, number>();
        const bids = new Map<number, number>();
        for (const [p, s] of prev.asks.map((l) => [l.price, l.size])) asks.set(p, s);
        for (const [p, s] of prev.bids.map((l) => [l.price, l.size])) bids.set(p, s);
        if (rows.asks) mergeInto(asks, rows.asks);
        if (rows.bids) mergeInto(bids, rows.bids);
        const askList = [...asks.entries()].sort((a, b) => a[0] - b[0]);
        const bidList = [...bids.entries()].sort((a, b) => b[0] - a[0]);
        const spread =
          askList.length && bidList.length ? askList[0][0] - bidList[0][0] : null;
        return {
          asks: askList.map(([price, size]) => ({ price, size })),
          bids: bidList.map(([price, size]) => ({ price, size })),
          seq: rows.seq ?? prev.seq,
          spread,
        };
      });
    },
    [],
  );

  useExchangeSocket("books", symbol, (frame) => {
    if (frame.action !== "snapshot" && frame.action !== "update") return;
    if (frame.data && typeof frame.data === "object") {
      const d = frame.data as { asks?: unknown[]; bids?: unknown[]; seq?: number | null };
      apply(d);
    }
  }, { category });

  return book;
}
