import { useCallback, useEffect, useState } from "react";
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

function sameBook(prev: OrderBookState, next: OrderBookState): boolean {
  const prevSize = (l: { price: number; size: number }) => `${l.price}:${l.size}`;
  return (
    (prev.asks[0]?.price ?? null) === (next.asks[0]?.price ?? null) &&
    (prev.bids[0]?.price ?? null) === (next.bids[0]?.price ?? null) &&
    prev.asks.length === next.asks.length &&
    prev.bids.length === next.bids.length &&
    prev.asks.every((l, i) => prevSize(l) === prevSize(next.asks[i])) &&
    prev.bids.every((l, i) => prevSize(l) === prevSize(next.bids[i]))
  );
}

/** Full-depth order book with snapshot (replace) + incremental merge (update). */
export function useOrderBook(symbol: string, category = "USDT-FUTURES"): OrderBookState {
  const [book, setBook] = useState<OrderBookState>(EMPTY_BOOK);

  // Reset the book immediately when the symbol/category changes so no
  // stale levels from the previous symbol can linger until its snapshot
  // arrives (or be mixed into the new symbol's book).
  useEffect(() => {
    setBook(EMPTY_BOOK);
  }, [symbol, category]);

  const apply = useCallback(
    (rows: { asks?: unknown[]; bids?: unknown[]; seq?: number | null }, action: "snapshot" | "update") => {
      setBook((prev) => {
        let next: OrderBookState;
        if (action === "snapshot") {
          // Snapshot = authoritative full book for this symbol: replace
          // wholesale, dropping any previous levels (stale-symbol cleanup).
          const asks = new Map<number, number>();
          const bids = new Map<number, number>();
          if (rows.asks) mergeInto(asks, rows.asks);
          if (rows.bids) mergeInto(bids, rows.bids);
          const askList = [...asks.entries()].sort((a, b) => a[0] - b[0]);
          const bidList = [...bids.entries()].sort((a, b) => b[0] - a[0]);
          next = {
            asks: askList.map(([price, size]) => ({ price, size })),
            bids: bidList.map(([price, size]) => ({ price, size })),
            seq: rows.seq ?? null,
            spread:
              askList.length && bidList.length ? askList[0][0] - bidList[0][0] : null,
          };
        } else {
          // Incremental update on top of the current book.
          const asks = new Map<number, number>();
          const bids = new Map<number, number>();
          for (const [p, s] of prev.asks.map((l) => [l.price, l.size])) asks.set(p, s);
          for (const [p, s] of prev.bids.map((l) => [l.price, l.size])) bids.set(p, s);
          if (rows.asks) mergeInto(asks, rows.asks);
          if (rows.bids) mergeInto(bids, rows.bids);
          const askList = [...asks.entries()].sort((a, b) => a[0] - b[0]);
          const bidList = [...bids.entries()].sort((a, b) => b[0] - a[0]);
          next = {
            asks: askList.map(([price, size]) => ({ price, size })),
            bids: bidList.map(([price, size]) => ({ price, size })),
            seq: rows.seq ?? prev.seq,
            spread:
              askList.length && bidList.length ? askList[0][0] - bidList[0][0] : null,
          };
        }
        // Skip re-render when the visible book is unchanged, avoiding a full
        // rebuild on every high-frequency frame.
        if (sameBook(prev, next)) return prev;
        return next;
      });
    },
    [],
  );

  useExchangeSocket("books", symbol, (frame) => {
    if (frame.action !== "snapshot" && frame.action !== "update") return;
    if (frame.data && typeof frame.data === "object") {
      const d = frame.data as { asks?: unknown[]; bids?: unknown[]; seq?: number | null };
      apply(d, frame.action);
    }
  }, { category });

  return book;
}
