import { beforeEach, describe, expect, it, vi } from "vitest";
import { BitgetDatafeed, periodToTimeframe } from "./datafeed";
import type { Period, SymbolInfo } from "@klinecharts/pro";

const m = vi.hoisted(() => ({
  candles: vi.fn(),
  candlesRecent: vi.fn(),
  instruments: vi.fn(),
  connectSnapshot: vi.fn(),
}));

vi.mock("./client", () => ({
  api: { candles: m.candles, candlesRecent: m.candlesRecent, instruments: m.instruments },
}));
vi.mock("./ws", () => ({ connectSnapshot: m.connectSnapshot }));
vi.mock("../lib/transform", async (orig) => {
  const mod = await orig<typeof import("../lib/transform")>();
  return { ...mod, candleToKLine: (c: any) => ({ timestamp: c.open_time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }) };
});

const SYMBOL: SymbolInfo = { ticker: "BTCUSDT", market: "USDT-FUTURES" };
const PERIOD: Period = { multiplier: 5, timespan: "minute", text: "5m" };

const INSTRUMENTS = [
  { symbol: "BTCUSDT", category: "USDT-FUTURES", pricePrecision: "1", quantityPrecision: "4", symbolType: "crypto", symbolStatus: "online" },
  { symbol: "ETHUSDT", category: "USDT-FUTURES", pricePrecision: "2", quantityPrecision: "5", symbolType: "crypto", symbolStatus: "online" },
  { symbol: "XAUUSDT", category: "SPOT", pricePrecision: "2", quantityPrecision: "3", symbolType: "metal", symbolStatus: "online" },
  { symbol: "AAPLUSDT", category: "USDT-FUTURES", pricePrecision: "2", quantityPrecision: "2", symbolType: "stock", isReality: "yes", symbolStatus: "online" },
];

beforeEach(() => {
  vi.clearAllMocks();
  m.instruments.mockResolvedValue({ instruments: INSTRUMENTS });
});

describe("periodToTimeframe", () => {
  it("maps minute/hour/day periods", () => {
    expect(periodToTimeframe({ multiplier: 5, timespan: "minute", text: "5m" })).toBe("5m");
    expect(periodToTimeframe({ multiplier: 1, timespan: "hour", text: "1H" })).toBe("1h");
    expect(periodToTimeframe({ multiplier: 4, timespan: "hour", text: "4H" })).toBe("4h");
    expect(periodToTimeframe({ multiplier: 12, timespan: "hour", text: "12H" })).toBe("12h");
    expect(periodToTimeframe({ multiplier: 1, timespan: "day", text: "1D" })).toBe("1d");
  });
});

describe("BitgetDatafeed.searchSymbols", () => {
  it("searches real instruments from the API", async () => {
    const d = new BitgetDatafeed();
    const all = await d.searchSymbols();
    expect(m.instruments).toHaveBeenCalled();
    expect(all.length).toBeGreaterThanOrEqual(4);
    expect(all.map((s) => s.ticker)).toEqual(["AAPLUSDT", "BTCUSDT", "ETHUSDT", "XAUUSDT"]);
  });

  it("filters by search keyword", async () => {
    const d = new BitgetDatafeed();
    const eth = await d.searchSymbols("eth");
    expect(eth.map((s) => s.ticker)).toEqual(["ETHUSDT"]);
  });

  it("finds metals and stock symbols", async () => {
    const d = new BitgetDatafeed();
    const gold = await d.searchSymbols("xau");
    expect(gold.map((s) => s.ticker)).toEqual(["XAUUSDT"]);
    expect(gold[0].market).toBe("SPOT");
    const apple = await d.searchSymbols("aapl");
    expect(apple[0].market).toBe("USDT-FUTURES");
  });

  it("carries precision metadata", async () => {
    const d = new BitgetDatafeed();
    const btc = (await d.searchSymbols("BTCUSDT"))[0];
    expect(btc.pricePrecision).toBe(1);
    expect(btc.volumePrecision).toBe(4);
  });
});

describe("BitgetDatafeed history", () => {
  it("loads history with fallback to recent", async () => {
    m.candles.mockResolvedValue({ candles: [], count: 0 });
    m.candlesRecent.mockResolvedValue({
      candles: [{ open_time: 1000, open: 1, high: 2, low: 0, close: 1, volume: 1 }],
      count: 1,
    });
    const d = new BitgetDatafeed();
    const bars = await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    expect(m.candlesRecent).toHaveBeenCalled();
    expect(bars[0].timestamp).toBe(1000);
  });

  it("returns stored history when available (no recent fallback)", async () => {
    m.candles.mockResolvedValue({
      candles: [{ open_time: 1000, open: 1, high: 2, low: 0, close: 1, volume: 1 }],
      count: 1,
    });
    const d = new BitgetDatafeed();
    await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    expect(m.candlesRecent).not.toHaveBeenCalled();
  });

  it("subscribe bridges ws last_candle to callback and unsubscribes", () => {
    const close = vi.fn();
    m.connectSnapshot.mockReturnValue({ close });
    const d = new BitgetDatafeed();
    const cb = vi.fn();
    d.subscribe(SYMBOL, PERIOD, cb);
    expect(m.connectSnapshot).toHaveBeenCalledTimes(1);
    const onMsg = m.connectSnapshot.mock.calls[0][1];
    onMsg({ last_candle: { open_time: 1000, open: 1, high: 2, low: 0, close: 3, volume: 1 } });
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ timestamp: 1000, close: 3 }));
    d.unsubscribe(SYMBOL, PERIOD);
    expect(close).toHaveBeenCalled();
  });
});
