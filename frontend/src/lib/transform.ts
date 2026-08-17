import type { OverlayCreate } from "klinecharts";
import type { Box, Candle, Level, Trendline } from "../api/types";

/** API candles (ms open_time) -> klinecharts KLineData (ms timestamps), sorted asc. */
export function candlesToKLineData(candles: Candle[]): Array<{
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}> {
  return candles
    .map((c) => ({
      timestamp: c.open_time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** A single API candle -> klinecharts KLineData (incremental last-bar update). */
export function candleToKLine(c: Candle): {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
} {
  return {
    timestamp: c.open_time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  };
}

export interface PriceLineConfig {
  price: number;
  color: string;
  title: string;
  kind: "support" | "resistance";
}

export function levelsToPriceLines(levels: Level[]): PriceLineConfig[] {
  return levels.map((l) => ({
    price: l.price,
    kind: l.kind,
    color: l.kind === "support" ? "#089981" : "#f23645",
    title: `${l.kind} (${l.strength.toFixed(1)})`,
  }));
}

export function priceLineToOverlay(line: PriceLineConfig): OverlayCreate {
  return {
    name: "priceLine",
    points: [{ value: line.price }],
    styles: { line: { color: line.color } },
    extendData: { title: line.title },
  };
}

/** Project a trendline onto two timestamps (ms) -> a klinecharts segment overlay. */
export function trendlineToSegment(
  line: Trendline,
  fromTimeMs: number,
  toTimeMs: number,
): OverlayCreate {
  return {
    name: "segment",
    points: [
      { timestamp: fromTimeMs, value: line.slope * fromTimeMs + line.intercept },
      { timestamp: toTimeMs, value: line.slope * toTimeMs + line.intercept },
    ],
  };
}

/** Map a box to a klinecharts rect overlay spanning the given time window (ms). */
export function boxToRect(box: Box, fromTimeMs: number, toTimeMs: number): OverlayCreate {
  return {
    name: "rect",
    points: [
      { timestamp: fromTimeMs, value: box.lower },
      { timestamp: toTimeMs, value: box.upper },
    ],
  };
}
