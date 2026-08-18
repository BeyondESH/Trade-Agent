import { useEffect, useMemo, useRef, useState } from "react";
import type { SymbolInfo } from "../types/trading";
import { api } from "../api/client";
import type { Ticker } from "../api/types";
import { useExchangeSocket } from "./useExchangeSocket";

/** Map a backend ticker row to the template SymbolInfo shape. */
export function tickerToSymbolInfo(t: Ticker): SymbolInfo {
  const num = (v: string | undefined): number => {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  };
  const pct = t.price24hPcnt ?? t.change24h;
  const changePct = num(pct);
  return {
    id: t.instId ?? t.symbol,
    ticker: t.instId ?? t.symbol,
    name: `${t.symbol} Perpetual`,
    exchange: (t.category ?? "USDT-FUTURES").replace("-FUTURES", ""),
    category: "crypto",
    price: num(t.lastPr),
    change24h: num(t.change24h),
    change24hPercent: changePct > 100 ? changePct / 100 : changePct,
    high24h: num(t.high24h),
    low24h: num(t.low24h),
    volume24h: t.quoteVolume ?? t.volume24h ?? "-",
    digits: precisionOf(t.lastPr),
    baseAsset: (t.instId ?? t.symbol).replace(/USDT|USDC$/i, ""),
    quoteAsset: "USDT",
    description: `${t.symbol} ${t.category ?? "USDT-FUTURES"} contract`,
  };
}

function precisionOf(v: string | undefined): number {
  if (!v) return 2;
  const s = String(v);
  const dot = s.indexOf(".");
  if (dot < 0) return 0;
  return Math.min(8, s.length - dot - 1);
}

/**
 * Real symbol list for the watchlist: REST `/tickers` snapshot + `/ws`
 * `ticker` wildcard updates. Merges all categories, keyed by `category:instId`.
 * Live ticker frames are coalesced with rAF so a high-frequency feed does not
 * re-render the whole app on every frame.
 */
export function useRealSymbols(): {
  symbols: SymbolInfo[];
  priceMap: Record<string, number | undefined>;
} {
  const [byKey, setByKey] = useState<Record<string, SymbolInfo>>({});
  const pending = useRef<Record<string, Ticker>>({});
  const flushScheduled = useRef(false);

  useEffect(() => {
    let alive = true;
    api
      .tickers()
      .then(({ tickers }) => {
        if (!alive) return;
        const m: Record<string, SymbolInfo> = {};
        for (const t of tickers) {
          m[`${t.category ?? "USDT-FUTURES"}:${t.instId ?? t.symbol}`] = tickerToSymbolInfo(t);
        }
        setByKey((prev) => ({ ...prev, ...m }));
      })
      .catch(() => {
        /* offline: ws will seed */
      });
    return () => {
      alive = false;
    };
  }, []);

  useExchangeSocket("ticker", "default", (frame) => {
    if (frame.action !== "snapshot" && frame.action !== "update") return;
    const data = frame.data as Record<string, Ticker> | Ticker[] | undefined;
    if (!data) return;
    const batch = Array.isArray(data) ? data : Object.values(data);
    if (!batch.length) return;
    for (const t of batch) {
      if (t && t.instId) pending.current[`${t.category ?? "USDT-FUTURES"}:${t.instId}`] = t;
    }
    if (!flushScheduled.current) {
      flushScheduled.current = true;
      requestAnimationFrame(() => {
        flushScheduled.current = false;
        const buf = pending.current;
        pending.current = {};
        const entries = Object.values(buf);
        if (entries.length === 0) return;
        setByKey((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const t of entries) {
            next[`${t.category ?? "USDT-FUTURES"}:${t.instId}`] = tickerToSymbolInfo(t);
            changed = true;
          }
          return changed ? next : prev;
        });
      });
    }
  });

  const symbols = useMemo(
    () => Object.values(byKey).sort((a, b) => a.id.localeCompare(b.id)),
    [byKey],
  );

  const priceMap = useMemo(() => {
    const m: Record<string, number | undefined> = {};
    for (const s of symbols) m[s.id] = s.price;
    return m;
  }, [symbols]);

  return { symbols, priceMap };
}
