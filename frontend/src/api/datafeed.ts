import type { Datafeed, DatafeedSubscribeCallback, Period, SymbolInfo } from "@klinecharts/pro";
import type { KLineData } from "klinecharts";
import { api } from "./client";
import type { Instrument, SeriesRef } from "./types";
import { connectSnapshot } from "./ws";
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

function toSeries(symbol: SymbolInfo, period: Period): SeriesRef {
  return {
    category: symbol.market ?? DEFAULT_CATEGORY,
    symbol: symbol.ticker,
    timeframe: periodToTimeframe(period),
  };
}

export class BitgetDatafeed implements Datafeed {
  private subscriptions = new Map<string, { close: () => void }>();

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
    try {
      const stored = await api.candles(series, from, to, 500);
      if (stored.count > 0) return stored.candles.map(candleToKLine);
    } catch {
      /* fall through to live recent */
    }
    try {
      const recent = await api.candlesRecent(series, 200);
      return recent.candles.map(candleToKLine);
    } catch {
      return [];
    }
  }

  subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    const key = `${symbol.market ?? DEFAULT_CATEGORY}/${symbol.ticker}/${period.text}`;
    this.unsubscribe(symbol, period);
    const conn = connectSnapshot(toSeries(symbol, period), (snap) => {
      if (snap.last_candle) callback(candleToKLine(snap.last_candle));
    }, 5);
    this.subscriptions.set(key, conn);
  }

  unsubscribe(symbol: SymbolInfo, period: Period): void {
    const key = `${symbol.market ?? DEFAULT_CATEGORY}/${symbol.ticker}/${period.text}`;
    const conn = this.subscriptions.get(key);
    if (conn) {
      conn.close();
      this.subscriptions.delete(key);
    }
  }
}
