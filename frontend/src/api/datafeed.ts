import type { Datafeed, DatafeedSubscribeCallback, Period, SymbolInfo } from "@klinecharts/pro";
import type { KLineData } from "klinecharts";
import { api } from "./client";
import type { SeriesRef } from "./types";
import { connectSnapshot } from "./ws";
import { candleToKLine } from "../lib/transform";

const CATEGORY = "USDT-FUTURES";

export const FIXED_SYMBOLS: SymbolInfo[] = [
  { ticker: "BTCUSDT", shortName: "BTCUSDT", market: "USDT-FUTURES", pricePrecision: 1, volumePrecision: 4 },
  { ticker: "ETHUSDT", shortName: "ETHUSDT", market: "USDT-FUTURES", pricePrecision: 2, volumePrecision: 5 },
  { ticker: "SOLUSDT", shortName: "SOLUSDT", market: "USDT-FUTURES", pricePrecision: 3, volumePrecision: 3 },
];

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
    category: symbol.market ?? CATEGORY,
    symbol: symbol.ticker,
    timeframe: periodToTimeframe(period),
  };
}

export class BitgetDatafeed implements Datafeed {
  private subscriptions = new Map<string, { close: () => void }>();

  async searchSymbols(search?: string): Promise<SymbolInfo[]> {
    const q = (search ?? "").toLowerCase();
    return FIXED_SYMBOLS.filter(
      (s) => !q || s.ticker.toLowerCase().includes(q) || s.shortName?.toLowerCase().includes(q),
    ).map((s) => ({ ...s }));
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
    const key = `${symbol.ticker}/${period.text}`;
    this.unsubscribe(symbol, period);
    const conn = connectSnapshot(toSeries(symbol, period), (snap) => {
      if (snap.last_candle) callback(candleToKLine(snap.last_candle));
    }, 5);
    this.subscriptions.set(key, conn);
  }

  unsubscribe(symbol: SymbolInfo, period: Period): void {
    const key = `${symbol.ticker}/${period.text}`;
    const conn = this.subscriptions.get(key);
    if (conn) {
      conn.close();
      this.subscriptions.delete(key);
    }
  }
}
