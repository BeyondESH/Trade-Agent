import type { Datafeed, DatafeedSubscribeCallback, Period, SymbolInfo } from "@klinecharts/pro";
import type { KLineData } from "klinecharts";
import { api } from "./client";
import type { BackfillResponse, Instrument, SeriesRef } from "./types";
import { categoryLabel } from "./types";
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
    name: inst.symbol,
    exchange: categoryLabel(inst.category),
    market: inst.category ?? DEFAULT_CATEGORY,
    pricePrecision: Number(inst.pricePrecision ?? inst.pricePlace ?? 2),
    volumePrecision: Number(inst.quantityPrecision ?? inst.volumePlace ?? 4),
  };
}

/** Identifier -> Bitget-native timeframe string (stable, case-insensitive-safe). */
export function periodToTimeframe(period: Period): string {
  switch (period.timespan) {
    case "second":
      return `${period.multiplier}s`;
    case "minute":
      return `${period.multiplier}m`;
    case "hour":
      return `${period.multiplier}h`;
    case "day":
      return `${period.multiplier}d`;
    case "week":
      return `${period.multiplier}w`;
    case "month":
      // `mo` never collides with minute `m` under case-insensitive comparison.
      return `${period.multiplier}mo`;
    default:
      throw new Error(`periodToTimeframe: unknown timespan "${period.timespan}"`);
  }
}

/** The set of native timeframe identifiers supported round-trip. */
const NATIVE_TIMEFRAMES = new Set([
  "1s", "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "12h",
  "1d", "3d", "1w", "1mo",
]);

/**
 * Inverse of periodToTimeframe. Throws for identifiers outside the native set
 * rather than silently falling back, so an unsupported level is surfaced
 * instead of showing wrong-series data.
 */
export function periodFromTimeframe(timeframe: string): Period {
  const tf = timeframe.trim().toLowerCase();
  if (!NATIVE_TIMEFRAMES.has(tf)) {
    throw new Error(`periodFromTimeframe: unsupported timeframe "${timeframe}"`);
  }
  const m = /^(\d+)([smhdw]|mo)$/i.exec(tf);
  if (!m) {
    throw new Error(`periodFromTimeframe: unsupported timeframe "${timeframe}"`);
  }
  const multiplier = Number(m[1]);
  const unit = m[2].toLowerCase();
  let timespan: Period["timespan"];
  switch (unit) {
    case "s": timespan = "second"; break;
    case "m": timespan = "minute"; break;
    case "h": timespan = "hour"; break;
    case "d": timespan = "day"; break;
    case "w": timespan = "week"; break;
    case "mo": timespan = "month"; break;
    default: throw new Error(`periodFromTimeframe: unsupported unit "${unit}"`);
  }
  const text = `${multiplier}${unit}`;
  return { multiplier, timespan, text };
}

/** True when the level is real-time only (no REST history, no persistence). */
export function isRealtimeOnlyTimeframe(timeframe: string): boolean {
  return timeframe.trim().toLowerCase() === "1s";
}

/** Normalize an identifier to the canonical lowercase form ("1MO" -> "1mo"). */
export function normalizeTimeframe(timeframe: string): string {
  return timeframe.trim().toLowerCase();
}

function toSeries(symbol: SymbolInfo, period: Period): SeriesRef {
  return {
    category: symbol.market ?? DEFAULT_CATEGORY,
    symbol: symbol.ticker,
    timeframe: periodToTimeframe(period),
  };
}

/**
 * Normalize a backward (older-history) load result before it is prepended to
 * the chart: sort ascending by timestamp, drop duplicate timestamps, and
 * (optionally) drop bars newer than the requested range. klinecharts
 * applyMoreData concatenates without deduping, so this keeps the prepend seam
 * free of duplicate bars.
 */
export function normalizeBackwardList(bars: KLineData[], maxTimestamp?: number): KLineData[] {
  const seen = new Set<number>();
  const out: KLineData[] = [];
  for (const bar of [...bars].sort((a, b) => a.timestamp - b.timestamp)) {
    if (maxTimestamp != null && bar.timestamp > maxTimestamp) continue;
    if (!seen.has(bar.timestamp)) {
      seen.add(bar.timestamp);
      out.push(bar);
    }
  }
  return out;
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
    // Realtime-only levels (e.g. `1s`) have no REST history; never poke a
    // history endpoint for them — the chart fills from the live WS stream.
    if (isRealtimeOnlyTimeframe(periodToTimeframe(period))) {
      return [];
    }
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
          return normalizeBackwardList(again, to);
        }
      }
      return normalizeBackwardList(stored, to);
    }
    // Nothing in the local store for [from, to].
    // The very first request for a series is an initial load: seed it from the
    // recent candles (this is the only path where returning the latest bars is
    // legitimate).
    if (prevEarliest == null) {
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
    // Backward load (dragging right beyond stored history) with an empty range:
    // fetch older data on demand. Never fall back to the latest candles here —
    // they are newer than the requested range and would be prepended as
    // duplicates by applyMoreData.
    if (!this.exhausted.has(key)) {
      await this.backfill(series, to).catch(() => {
        /* backfill is best-effort */
      });
      const again = await this.fetchStored(series, from, to);
      if (again !== null && again.length > 0) {
        this.noteEarliest(key, again[0].timestamp);
        return normalizeBackwardList(again, to);
      }
    }
    return [];
  }

  /**
   * Low-priority background prefetch: extend the known history of the given
   * series one backfill pass past its current earliest bar. Throttled to at
   * most once per 5s per series; in-flight requests are deduped.
   */
  prefetchDeeper(symbol: SymbolInfo, period: Period): void {
    // Realtime-only levels never accumulate persisted history to extend.
    if (isRealtimeOnlyTimeframe(periodToTimeframe(period))) return;
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
