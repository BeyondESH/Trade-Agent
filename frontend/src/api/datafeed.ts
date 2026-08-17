import type { Datafeed, DatafeedSubscribeCallback, Period, SymbolInfo } from "@klinecharts/pro";
import type { KLineData } from "klinecharts";
import { api } from "./client";
import type { BackfillResponse, Instrument, SeriesRef } from "./types";
import { bitgetWs, type BitgetWsStatus, type CandleSubHandle } from "./bitgetWs";
import type { ConnStatus } from "./ws";
import { candleToKLine } from "../lib/transform";

const DEFAULT_CATEGORY = "USDT-FUTURES";

// Instrument cache for symbol search (reloaded on a TTL or a clear).
let instrumentCache: Instrument[] | null = null;
let instrumentCacheAt = 0;
const INSTRUMENT_TTL_MS = 60_000;

async function loadInstruments(force = false): Promise<Instrument[]> {
  const now = Date.now();
  if (!force && instrumentCache && now - instrumentCacheAt < INSTRUMENT_TTL_MS) {
    return instrumentCache;
  }
  try {
    const { instruments } = await api.instruments();
    instrumentCache = instruments;
    instrumentCacheAt = now;
    return instruments;
  } catch {
    return instrumentCache ?? [];
  }
}

function instrumentToSymbolInfo(inst: Instrument): SymbolInfo {
  return {
    ticker: inst.symbol,
    shortName: inst.symbol,
    market: inst.category ?? DEFAULT_CATEGORY,
    pricePrecision: Number(inst.pricePrecision ?? inst.pricePlace ?? 2),
    volumePrecision: Number(inst.quantityPrecision ?? inst.volumePlace ?? 4),
  };
}

export function periodToTimeframe(period: Period): string {
  switch (period.timespan) {
    case "minute":
      return `${period.multiplier}m`;
    case "hour":
      return `${period.multiplier}h`;
    case "day":
      return `${period.multiplier}d`;
    default:
      return period.text.toLowerCase();
  }
}

/** Inverse of periodToTimeframe; falls back to 5m for unknown formats. */
export function periodFromTimeframe(timeframe: string): Period {
  const m = /^(\d+)([mhd])$/i.exec(timeframe.trim());
  if (m) {
    const multiplier = Number(m[1]);
    const unit = m[2].toLowerCase();
    const timespan = unit === "m" ? "minute" : unit === "h" ? "hour" : "day";
    const text = `${multiplier}${unit}`;
    return { multiplier, timespan, text };
  }
  return { multiplier: 5, timespan: "minute", text: "5m" };
}

function toSeries(symbol: SymbolInfo, period: Period): SeriesRef {
  return {
    category: symbol.market ?? DEFAULT_CATEGORY,
    symbol: symbol.ticker,
    timeframe: periodToTimeframe(period),
  };
}

export class BitgetDatafeed implements Datafeed {
  private subscriptions = new Map<string, CandleSubHandle>();
  private statusUnsub: (() => void) | null = null;
  /** While suspended (replay mode) live candle updates are dropped. */
  private suspended = false;

  suspendUpdates(v: boolean): void {
    this.suspended = v;
  }

  /** Forward the shared candle-socket status to the given listener. */
  setConnStateListener(listener?: (state: ConnStatus) => void): void {
    this.statusUnsub?.();
    this.statusUnsub = null;
    if (listener) {
      this.statusUnsub = bitgetWs.onStatus((state: BitgetWsStatus) => listener(state));
    }
  }

  /** Dynamically search the full market (all categories) from instruments. */
  async searchSymbols(search?: string): Promise<SymbolInfo[]> {
    const q = (search ?? "").trim().toLowerCase();
    const instruments = await loadInstruments();
    const matched = instruments.filter((inst) => {
      if (inst.symbolStatus && inst.symbolStatus !== "online") return false;
      if (!q) return true;
      return (
        inst.symbol.toLowerCase().includes(q) ||
        (inst.baseCoin ?? "").toLowerCase().includes(q)
      );
    });
    // prefer smaller/quoted symbols first for stable ordering
    matched.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return matched.slice(0, 100).map(instrumentToSymbolInfo);
  }

  async getHistoryKLineData(
    symbol: SymbolInfo,
    period: Period,
    from: number,
    to: number,
  ): Promise<KLineData[]> {
    const series = toSeries(symbol, period);
    const key = this.seriesKey(series);
    // Only backfill when the request goes further back than the earliest bar
    // we have *already seen*; the very first load always asks for the deep
    // past and must not trigger a server-side fetch.
    const prevEarliest = this.earliest.get(key);
    const stored = await this.fetchStored(series, from, to);
    if (stored !== null && stored.length > 0) {
      this.noteEarliest(key, stored[0].timestamp);
      if (prevEarliest != null && from < prevEarliest && !this.exhausted.has(key)) {
        await this.backfill(series, prevEarliest).catch(() => {
          /* backfill is best-effort; serve what we already have */
        });
        const again = await this.fetchStored(series, from, to);
        if (again !== null && again.length > 0) {
          this.noteEarliest(key, again[0].timestamp);
          return again;
        }
      }
      return stored;
    }
    try {
      const recent = await api.candlesRecent(series, 200);
      if (recent.candles.length > 0) {
        this.noteEarliest(key, recent.candles[0].open_time);
      }
      return recent.candles.map(candleToKLine);
    } catch {
      return [];
    }
  }

  /**
   * Low-priority background prefetch: extend the known history of the given
   * series one backfill pass past its current earliest bar. Throttled to at
   * most once per 5s per series; in-flight requests are deduped.
   */
  prefetchDeeper(symbol: SymbolInfo, period: Period): void {
    const series = toSeries(symbol, period);
    const key = this.seriesKey(series);
    const before = this.earliest.get(key);
    if (before == null || this.exhausted.has(key)) return;
    const now = Date.now();
    const last = this.lastPrefetchAt.get(key) ?? 0;
    if (now - last < 5_000) return;
    this.lastPrefetchAt.set(key, now);
    setTimeout(() => {
      this.backfill(series, before).catch(() => {
        /* best-effort */
      });
    }, 0);
  }

  subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    const key = `${symbol.market ?? DEFAULT_CATEGORY}/${symbol.ticker}/${period.text}`;
    this.unsubscribe(symbol, period);
    const handle = bitgetWs.subscribe(toSeries(symbol, period), (candle) => {
      if (this.suspended) return;
      callback(candleToKLine(candle));
    });
    this.subscriptions.set(key, handle);
  }

  unsubscribe(symbol: SymbolInfo, period: Period): void {
    const key = `${symbol.market ?? DEFAULT_CATEGORY}/${symbol.ticker}/${period.text}`;
    const conn = this.subscriptions.get(key);
    if (conn) {
      conn.close();
      this.subscriptions.delete(key);
    }
  }

  private earliest = new Map<string, number>();
  private exhausted = new Set<string>();
  private lastPrefetchAt = new Map<string, number>();
  private inflight = new Map<string, Promise<BackfillResponse>>();

  /** Series key shared by backfill dedupe / prefetch throttling. */
  seriesKey(series: SeriesRef): string {
    return `${series.category}:${series.symbol}:${series.timeframe}`;
  }

  private async fetchStored(series: SeriesRef, from: number, to: number): Promise<KLineData[] | null> {
    try {
      const stored = await api.candles(series, from, to, 500);
      if (stored.count > 0) return stored.candles.map(candleToKLine);
      return [];
    } catch {
      return null;
    }
  }

  private noteEarliest(key: string, openTime: number): void {
    const cur = this.earliest.get(key);
    if (cur == null || openTime < cur) this.earliest.set(key, openTime);
  }

  /** Trigger a server-side backfill, deduping concurrent requests. */
  private backfill(series: SeriesRef, before: number): Promise<BackfillResponse> {
    const key = `${this.seriesKey(series)}:${before}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = api
      .backfill(series, before)
      .then((res) => {
        if (res.earliest_reached) this.exhausted.add(this.seriesKey(series));
        return res;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, p);
    return p;
  }
}

/**
 * Resolve a symbol to full SymbolInfo (category + precisions) from the
 * instrument catalog. Precisions come from the instrument, not a hardcoded
 * default; the default is only used when the symbol is unknown to the hub.
 */
export async function resolveSymbolInfo(instId: string, category?: string): Promise<SymbolInfo> {
  const instruments = await loadInstruments();
  const inst = instruments.find((i) =>
    category
      ? i.symbol === instId && (i.category ?? DEFAULT_CATEGORY) === category
      : i.symbol === instId,
  );
  if (inst) return instrumentToSymbolInfo(inst);
  return {
    ticker: instId,
    shortName: instId,
    market: category ?? DEFAULT_CATEGORY,
    pricePrecision: 2,
    volumePrecision: 4,
  };
}
