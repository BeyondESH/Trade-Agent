import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { SymbolType, Ticker, TickerSortKey } from "../api/types";
import { useExchangeSocket } from "./useExchangeSocket";

export type CategoryTab = "all" | "SPOT" | "MARGIN" | "USDT-FUTURES" | "USDC-FUTURES" | "COIN-FUTURES";

export interface TickerListState {
  tickers: Ticker[];
  search: string;
  tab: CategoryTab;
  symbolType: SymbolType | "all";
  sortKey: TickerSortKey;
  sortDir: "asc" | "desc";
  setSearch: (q: string) => void;
  setTab: (tab: CategoryTab) => void;
  setSymbolType: (t: SymbolType | "all") => void;
  setSort: (key: TickerSortKey) => void;
  /** all symbols the hub has told us about (sorted by ticker) */
  symbols: string[];
}

function defaultSort(a: Ticker, b: Ticker): number {
  return a.symbol.localeCompare(b.symbol);
}

function sortValue(t: Ticker, key: TickerSortKey): number | string {
  switch (key) {
    case "price":
      return toNumber(t.lastPr);
    case "change":
      return toNumber(t.change24h ?? t.price24hPcnt);
    case "volume":
      return toNumber(t.baseVolume ?? t.volume24h);
    case "turnover":
      return toNumber(t.quoteVolume ?? t.turnover24h);
    default:
      return t.symbol;
  }
}

function toNumber(v: string | undefined): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function snapshotKey(t: Ticker): string {
  return `${t.category ?? "USDT-FUTURES"}:${t.instId}`;
}

export function useTickerList(): TickerListState {
  const [snapshot, setSnapshot] = useState<Record<string, Ticker>>({});
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<CategoryTab>("all");
  const [symbolType, setSymbolType] = useState<SymbolType | "all">("all");
  const [sortKey, setSortKey] = useState<TickerSortKey>("change");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // initial snapshot from REST (all categories merged; key includes category so
  // the same symbol across categories (e.g. BTCUSDT in SPOT and USDT-FUTURES)
  // is kept distinct)
  useEffect(() => {
    let alive = true;
    api
      .tickers()
      .then(({ tickers }) => {
        if (!alive) return;
        const m: Record<string, Ticker> = {};
        for (const t of tickers) {
          m[snapshotKey(t)] = t;
        }
        setSnapshot((prev) => ({ ...prev, ...m }));
      })
      .catch(() => {
        /* offline: hub will deliver snapshot via ws */
      });
    return () => {
      alive = false;
    };
  }, []);

  useExchangeSocket("ticker", "default", (frame) => {
    if (frame.action !== "snapshot" && frame.action !== "update") return;
    const data = frame.data as Record<string, Ticker> | Ticker[];
    if (!data) return;
    const batch = Array.isArray(data) ? data : Object.values(data);
    if (batch.length === 0) return;
    setSnapshot((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const t of batch) {
        if (t && t.instId) {
          next[snapshotKey(t)] = t;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  });

  const setSort = useCallback((key: TickerSortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir("desc");
      return key;
    });
  }, []);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    const rows = Object.values(snapshot).filter((t) => {
      if (q && !t.instId.toLowerCase().includes(q)) return false;
      if (tab !== "all" && t.category && t.category !== tab) return false;
      if (symbolType !== "all" && t.symbolType && t.symbolType !== symbolType) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (typeof va === "number" && typeof vb === "number") {
        return va === vb ? defaultSort(a, b) : (va - vb) * dir;
      }
      const sa = String(va);
      const sb = String(vb);
      return sa === sb ? defaultSort(a, b) : sa.localeCompare(sb) * dir;
    });
    return rows;
  }, [snapshot, search, tab, symbolType, sortKey, sortDir]);

  const symbols = useMemo(
    () => Array.from(new Set(Object.values(snapshot).map((t) => t.instId))).sort((a, b) => a.localeCompare(b)),
    [snapshot],
  );

  return {
    tickers: list,
    search,
    tab,
    symbolType,
    sortKey,
    sortDir,
    setSearch,
    setTab,
    setSymbolType,
    setSort,
    symbols,
  };
}
