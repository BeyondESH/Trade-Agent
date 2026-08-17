import { useState } from "react";
import { useExchangeSocket } from "./useExchangeSocket";

export interface Trade {
  instId: string;
  price: string;
  size: string;
  side: "buy" | "sell";
  ts: string;
}

const MAX_TRADES = 50;

/** Recent trades tape: REST snapshot on symbol change, then incremental appends. */
export function useTrades(symbol: string, category = "USDT-FUTURES"): Trade[] {
  const [trades, setTrades] = useState<Trade[]>([]);

  useExchangeSocket("trade", symbol, (frame) => {
    if (frame.action === "snapshot") {
      const d = frame.data as { trades?: Trade[] } | undefined;
      if (d && Array.isArray(d.trades)) {
        setTrades(d.trades.slice(-MAX_TRADES));
      }
      return;
    }
    if (frame.action === "update") {
      const d = Array.isArray(frame.data) ? (frame.data as Trade[]) : [];
      if (d.length === 0) return;
      setTrades((prev) => {
        const next = [...d.reverse(), ...prev];
        return next.slice(0, MAX_TRADES);
      });
    }
  }, { category });

  return trades;
}
