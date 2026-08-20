import { beforeEach, describe, expect, it, vi } from "vitest";
import { BitgetDatafeed, normalizeBackwardList, periodFromTimeframe, periodToTimeframe } from "./datafeed";
import type { Period, SymbolInfo } from "@klinecharts/pro";

const m = vi.hoisted(() => ({
  candles: vi.fn(),
  candlesRecent: vi.fn(),
  backfill: vi.fn(),
  instruments: vi.fn(),
  wsSubscribe: vi.fn(),
  wsOnStatus: vi.fn(),
}));

vi.mock("./client", () => ({
  api: { candles: m.candles, candlesRecent: m.candlesRecent, backfill: m.backfill, instruments: m.instruments },
}));
vi.mock("./bitgetWs", () => ({
  bitgetWs: { subscribe: m.wsSubscribe, onStatus: m.wsOnStatus },
}));
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
  m.wsSubscribe.mockReturnValue({ close: vi.fn() });
  m.wsOnStatus.mockReturnValue(() => {});
  // Deterministic per-test defaults; individual tests override with
  // mockResolvedValueOnce/mockResolvedValue. Without these bases, leftover
  // implementations from a previous test leak through once the once-queue of
  // the current test is exhausted.
  m.candles.mockResolvedValue({ candles: [], count: 0 });
  m.candlesRecent.mockResolvedValue({ candles: [], count: 0 });
  m.backfill.mockResolvedValue({ series: "s", appended: 0, earliest_reached: false });
});

describe("periodToTimeframe", () => {
  it("maps minute/hour/day periods", () => {
    expect(periodToTimeframe({ multiplier: 5, timespan: "minute", text: "5m" })).toBe("5m");
    expect(periodToTimeframe({ multiplier: 1, timespan: "hour", text: "1H" })).toBe("1h");
    expect(periodToTimeframe({ multiplier: 4, timespan: "hour", text: "4H" })).toBe("4h");
    expect(periodToTimeframe({ multiplier: 12, timespan: "hour", text: "12H" })).toBe("12h");
    expect(periodToTimeframe({ multiplier: 1, timespan: "day", text: "1D" })).toBe("1d");
  });

  it("maps second/week/month periods to distinct-timeframe identifiers", () => {
    expect(periodToTimeframe({ multiplier: 1, timespan: "second", text: "1s" })).toBe("1s");
    expect(periodToTimeframe({ multiplier: 1, timespan: "week", text: "1W" })).toBe("1w");
    // month `1mo` never collides with minute `1m`
    expect(periodToTimeframe({ multiplier: 1, timespan: "month", text: "1M" })).toBe("1mo");
    expect(periodToTimeframe({ multiplier: 1, timespan: "month", text: "1M" })).not.toBe("1m");
  });
});

describe("periodFromTimeframe", () => {
  it("parses the full native set round-trip", () => {
    const native = ["1s", "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "3d", "1w", "1mo"];
    for (const tf of native) {
      expect(periodToTimeframe(periodFromTimeframe(tf))).toBe(tf);
    }
  });

  it("never collapses month onto minute", () => {
    const month = periodFromTimeframe("1mo");
    expect(month.timespan).toBe("month");
    const minute = periodFromTimeframe("1m");
    expect(minute.timespan).toBe("minute");
    expect(periodToTimeframe(month)).not.toBe(periodToTimeframe(minute));
  });

  it("is case-insensitive for known levels", () => {
    expect(periodToTimeframe(periodFromTimeframe("1H"))).toBe("1h");
    expect(periodToTimeframe(periodFromTimeframe("1MO"))).toBe("1mo");
  });

  it("throws on unknown periods instead of silently falling back", () => {
    expect(() => periodFromTimeframe("99x")).toThrow();
    expect(() => periodFromTimeframe("15s")).toThrow();
    expect(() => periodFromTimeframe("6M")).toThrow();
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

  it("exposes name and Chinese category label for the native search list", async () => {
    const d = new BitgetDatafeed();
    const btc = (await d.searchSymbols("BTCUSDT"))[0];
    expect(btc.name).toBe("BTCUSDT");
    expect(btc.exchange).toBe("U本位合约");
  });

  it("keeps cross-category symbols distinct with Chinese labels and raw market keys", async () => {
    m.instruments.mockResolvedValueOnce({
      instruments: [
        { symbol: "BTCUSDT", category: "SPOT", pricePrecision: "2", quantityPrecision: "5", symbolType: "crypto", symbolStatus: "online" },
        { symbol: "BTCUSDT", category: "USDT-FUTURES", pricePrecision: "1", quantityPrecision: "4", symbolType: "crypto", symbolStatus: "online" },
      ],
    });
    // Bypass the 60s instrument cache so the once-mock above is actually used.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    const d = new BitgetDatafeed();
    const hits = await d.searchSymbols("BTCUSDT");
    vi.useRealTimers();
    expect(hits).toHaveLength(2);
    expect(hits.map((s) => s.market).sort()).toEqual(["SPOT", "USDT-FUTURES"]);
    expect(hits.map((s) => s.exchange).sort()).toEqual(["U本位合约", "现货"]);
  });
});

describe("BitgetDatafeed history", () => {
  it("short-circuits realtime-only periods without poking any history endpoint", async () => {
    const d = new BitgetDatafeed();
    const bars = await d.getHistoryKLineData(
      SYMBOL,
      { multiplier: 1, timespan: "second", text: "1s" },
      0,
      2000,
    );
    expect(bars).toEqual([]);
    expect(m.candles).not.toHaveBeenCalled();
    expect(m.candlesRecent).not.toHaveBeenCalled();
    expect(m.backfill).not.toHaveBeenCalled();
  });

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
    expect(m.candlesRecent).toHaveBeenCalled();
  });

  it("merges live-buffer bars newer than the stored tail to fill the gap", async () => {
    m.candles.mockResolvedValue({
      candles: [
        { open_time: 1000, open: 1, high: 2, low: 0, close: 1, volume: 1 },
        { open_time: 2000, open: 1, high: 2, low: 0, close: 1, volume: 1 },
      ],
      count: 2,
    });
    // buffer carries the bars the store is missing (between 2000 and now)
    m.candlesRecent.mockResolvedValue({
      candles: [
        { open_time: 3000, open: 2, high: 3, low: 1, close: 2.5, volume: 2 },
        { open_time: 4000, open: 2.5, high: 4, low: 2, close: 3, volume: 3 },
      ],
      count: 2,
    });
    const d = new BitgetDatafeed();
    const bars = await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 5000);
    expect(bars.map((b) => b.timestamp)).toEqual([1000, 2000, 3000, 4000]);
  });

  it("does not duplicate bars already present in the store", async () => {
    m.candles.mockResolvedValue({
      candles: [
        { open_time: 1000, open: 1, high: 2, low: 0, close: 1, volume: 1 },
        { open_time: 2000, open: 1, high: 2, low: 0, close: 1, volume: 1 },
      ],
      count: 2,
    });
    // buffer overlaps the stored tail and adds one newer bar
    m.candlesRecent.mockResolvedValue({
      candles: [
        { open_time: 2000, open: 1, high: 2, low: 0, close: 1, volume: 1 },
        { open_time: 3000, open: 2, high: 3, low: 1, close: 2.5, volume: 2 },
      ],
      count: 2,
    });
    const d = new BitgetDatafeed();
    const bars = await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 4000);
    expect(bars.map((b) => b.timestamp)).toEqual([1000, 2000, 3000]);
  });

  it("fills a middle gap where the store tail is newer than the missing bars", async () => {
    // store is missing the middle (3000-4000) but has bars around it
    m.candles.mockResolvedValue({
      candles: [
        { open_time: 1000, open: 1, high: 2, low: 0, close: 1, volume: 1 },
        { open_time: 2000, open: 1, high: 2, low: 0, close: 1, volume: 1 },
        { open_time: 5000, open: 1, high: 2, low: 0, close: 1, volume: 1 },
      ],
      count: 3,
    });
    // buffer carries the missing middle bars plus the newer tail
    m.candlesRecent.mockResolvedValue({
      candles: [
        { open_time: 3000, open: 2, high: 3, low: 1, close: 2.5, volume: 2 },
        { open_time: 4000, open: 2.5, high: 4, low: 2, close: 3, volume: 3 },
        { open_time: 5000, open: 3, high: 4, low: 2, close: 3.5, volume: 4 },
      ],
      count: 3,
    });
    const d = new BitgetDatafeed();
    const bars = await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 6000);
    expect(bars.map((b) => b.timestamp)).toEqual([1000, 2000, 3000, 4000, 5000]);
  });

  it("keeps stored history when the buffer has nothing newer", async () => {
    m.candles.mockResolvedValue({
      candles: [{ open_time: 1000, open: 1, high: 2, low: 0, close: 1, volume: 1 }],
      count: 1,
    });
    m.candlesRecent.mockResolvedValue({ candles: [], count: 0 });
    const d = new BitgetDatafeed();
    const bars = await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    expect(bars.map((b) => b.timestamp)).toEqual([1000]);
  });

  it("keeps stored history when the buffer call fails", async () => {
    m.candles.mockResolvedValue({
      candles: [{ open_time: 1000, open: 1, high: 2, low: 0, close: 1, volume: 1 }],
      count: 1,
    });
    m.candlesRecent.mockRejectedValue(new Error("offline"));
    const d = new BitgetDatafeed();
    const bars = await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    expect(bars.map((b) => b.timestamp)).toEqual([1000]);
  });

  it("subscribe bridges the live WS candle to the callback and unsubscribes", () => {
    const close = vi.fn();
    m.wsSubscribe.mockReturnValue({ close });
    const d = new BitgetDatafeed();
    const cb = vi.fn();
    d.subscribe(SYMBOL, PERIOD, cb);
    expect(m.wsSubscribe).toHaveBeenCalledTimes(1);
    expect(m.wsSubscribe.mock.calls[0][0]).toMatchObject({
      category: "USDT-FUTURES",
      symbol: "BTCUSDT",
      timeframe: "5m",
    });
    const onCandle = m.wsSubscribe.mock.calls[0][1];
    onCandle({ open_time: 1000, open: 1, high: 2, low: 0, close: 3, volume: 1 });
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ timestamp: 1000, close: 3 }));
    d.unsubscribe(SYMBOL, PERIOD);
    expect(close).toHaveBeenCalled();
  });

  it("subscribes via the shared WS feed, not the legacy snapshot poll", () => {
    const d = new BitgetDatafeed();
    d.subscribe(SYMBOL, PERIOD, vi.fn());
    d.subscribe(SYMBOL, PERIOD, vi.fn());
    // Each subscribe replaces the previous one for the same series key.
    expect(m.wsSubscribe).toHaveBeenCalledTimes(2);
  });

  it("drops live candles while suspended (replay) and resumes after", () => {
    m.wsSubscribe.mockReturnValue({ close: vi.fn() });
    const d = new BitgetDatafeed();
    const cb = vi.fn();
    d.subscribe(SYMBOL, PERIOD, cb);
    const onCandle = m.wsSubscribe.mock.calls[0][1];
    d.suspendUpdates(true);
    onCandle({ open_time: 1000, open: 1, high: 2, low: 0, close: 3, volume: 1 });
    expect(cb).not.toHaveBeenCalled();
    d.suspendUpdates(false);
    onCandle({ open_time: 2000, open: 1, high: 2, low: 0, close: 4, volume: 1 });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ timestamp: 2000, close: 4 }));
  });

  it("forwards the shared WS connection status to the listener", () => {
    const unsub = vi.fn();
    m.wsOnStatus.mockReturnValue(unsub);
    const d = new BitgetDatafeed();
    const listener = vi.fn();
    d.setConnStateListener(listener);
    expect(m.wsOnStatus).toHaveBeenCalledTimes(1);
    m.wsOnStatus.mock.calls[0][0]("reconnecting");
    expect(listener).toHaveBeenCalledWith("reconnecting");
    d.setConnStateListener(undefined);
    expect(unsub).toHaveBeenCalled();
  });
});

const candle = (t: number) => ({ open_time: t, open: 1, high: 2, low: 0, close: 1, volume: 1 });

describe("BitgetDatafeed backfill", () => {
  it("does not backfill on the very first load", async () => {
    m.candles.mockResolvedValue({ candles: [candle(1000)], count: 1 });
    const d = new BitgetDatafeed();
    await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    expect(m.backfill).not.toHaveBeenCalled();
  });

  it("triggers backfill when paging beyond the known earliest, then serves refetched range", async () => {
    m.candles
      .mockResolvedValueOnce({ candles: [candle(1000)], count: 1 })
      .mockResolvedValueOnce({ candles: [candle(1000)], count: 1 })
      .mockResolvedValueOnce({ candles: [candle(500)], count: 1 });
    m.backfill.mockResolvedValue({ series: "s", appended: 1, earliest_reached: false });
    const d = new BitgetDatafeed();
    await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    expect(m.backfill).not.toHaveBeenCalled();
    const bars = await d.getHistoryKLineData(SYMBOL, PERIOD, 400, 2000);
    expect(m.backfill).toHaveBeenCalledTimes(1);
    expect(m.backfill.mock.calls[0][1]).toBe(1000);
    expect(bars[0].timestamp).toBe(500);
  });

  it("stops backfilling once earliest_reached", async () => {
    m.candles.mockResolvedValue({ candles: [candle(1000)], count: 1 });
    m.backfill.mockResolvedValue({ series: "s", appended: 0, earliest_reached: true });
    const d = new BitgetDatafeed();
    await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    await d.getHistoryKLineData(SYMBOL, PERIOD, -100, 2000);
    await d.getHistoryKLineData(SYMBOL, PERIOD, -200, 2000);
    expect(m.backfill).toHaveBeenCalledTimes(1);
  });

  it("dedupes overlapping backfill requests for the same series/before", async () => {
    let resolveBf: (v: { series: string; appended: number; earliest_reached: boolean }) => void = () => {};
    const pending = new Promise<{ series: string; appended: number; earliest_reached: boolean }>((r) => {
      resolveBf = r;
    });
    m.candles.mockResolvedValue({ candles: [candle(1000)], count: 1 });
    m.backfill.mockReturnValue(pending);
    const d = new BitgetDatafeed();
    await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    const p1 = d.getHistoryKLineData(SYMBOL, PERIOD, 400, 2000);
    const p2 = d.getHistoryKLineData(SYMBOL, PERIOD, 300, 2000);
    resolveBf({ series: "s", appended: 0, earliest_reached: false });
    await Promise.all([p1, p2]);
    expect(m.backfill).toHaveBeenCalledTimes(1);
  });

  it("prefetchDeeper throttles and skips unknown series", async () => {
    m.candles.mockResolvedValue({ candles: [candle(1000)], count: 1 });
    m.backfill.mockResolvedValue({ series: "s", appended: 0, earliest_reached: false });
    const d = new BitgetDatafeed();
    d.prefetchDeeper(SYMBOL, PERIOD);
    await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    d.prefetchDeeper(SYMBOL, PERIOD);
    d.prefetchDeeper(SYMBOL, PERIOD);
    await new Promise((r) => setTimeout(r, 10));
    expect(m.backfill).toHaveBeenCalledTimes(1);
  });

  it("backward load with empty store triggers on-demand backfill to `to` and serves refetched range", async () => {
    m.candles
      .mockResolvedValueOnce({ candles: [candle(1000)], count: 1 })
      .mockResolvedValueOnce({ candles: [], count: 0 })
      .mockResolvedValueOnce({ candles: [candle(400), candle(500)], count: 2 });
    m.backfill.mockResolvedValue({ series: "s", appended: 2, earliest_reached: false });
    const d = new BitgetDatafeed();
    await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    const bars = await d.getHistoryKLineData(SYMBOL, PERIOD, 400, 1000);
    expect(m.backfill).toHaveBeenCalledTimes(1);
    expect(m.backfill.mock.calls[0][1]).toBe(1000);
    expect(bars.map((b) => b.timestamp)).toEqual([400, 500]);
    // only the merge call from the initial stored-data load, never the backward path
    expect(m.candlesRecent).toHaveBeenCalledTimes(1);
  });

  it("backward load with empty store and failed backfill returns [] without recent fallback", async () => {
    m.candles
      .mockResolvedValueOnce({ candles: [candle(1000)], count: 1 })
      .mockResolvedValueOnce({ candles: [], count: 0 });
    m.backfill.mockRejectedValue(new Error("boom"));
    const d = new BitgetDatafeed();
    await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    const bars = await d.getHistoryKLineData(SYMBOL, PERIOD, 400, 1000);
    expect(m.backfill).toHaveBeenCalledTimes(1);
    expect(m.candlesRecent).toHaveBeenCalledTimes(1);
    expect(bars).toEqual([]);
  });

  it("backward load with empty store stops backfilling once earliest_reached", async () => {
    m.candles
      .mockResolvedValueOnce({ candles: [candle(1000)], count: 1 })
      .mockResolvedValueOnce({ candles: [], count: 0 })
      .mockResolvedValueOnce({ candles: [], count: 0 });
    m.backfill.mockResolvedValue({ series: "s", appended: 0, earliest_reached: true });
    const d = new BitgetDatafeed();
    await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    await d.getHistoryKLineData(SYMBOL, PERIOD, 400, 1000);
    const bars = await d.getHistoryKLineData(SYMBOL, PERIOD, 200, 900);
    expect(m.backfill).toHaveBeenCalledTimes(1);
    expect(m.candlesRecent).toHaveBeenCalledTimes(1);
    expect(bars).toEqual([]);
  });

  it("backward load with empty store returns [] when refetch after backfill is still empty", async () => {
    m.candles
      .mockResolvedValueOnce({ candles: [candle(1000)], count: 1 })
      .mockResolvedValueOnce({ candles: [], count: 0 })
      .mockResolvedValueOnce({ candles: [], count: 0 });
    m.backfill.mockResolvedValue({ series: "s", appended: 0, earliest_reached: false });
    const d = new BitgetDatafeed();
    await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    const bars = await d.getHistoryKLineData(SYMBOL, PERIOD, 400, 1000);
    expect(m.backfill).toHaveBeenCalledTimes(1);
    expect(bars).toEqual([]);
    expect(m.candlesRecent).toHaveBeenCalledTimes(1);
  });

  it("initial load with empty store still falls back to recent candles (regression guard)", async () => {
    m.candles.mockResolvedValue({ candles: [], count: 0 });
    m.candlesRecent.mockResolvedValue({ candles: [candle(1000)], count: 1 });
    const d = new BitgetDatafeed();
    const bars = await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    expect(m.candlesRecent).toHaveBeenCalledTimes(1);
    expect(bars[0].timestamp).toBe(1000);
  });

  it("backward load never returns bars newer than the requested range", async () => {
    m.candles
      .mockResolvedValueOnce({ candles: [candle(1000)], count: 1 })
      .mockResolvedValueOnce({ candles: [], count: 0 })
      .mockResolvedValueOnce({ candles: [candle(300), candle(500), candle(900)], count: 3 });
    m.backfill.mockResolvedValue({ series: "s", appended: 3, earliest_reached: false });
    const d = new BitgetDatafeed();
    await d.getHistoryKLineData(SYMBOL, PERIOD, 0, 2000);
    const bars = await d.getHistoryKLineData(SYMBOL, PERIOD, 200, 500);
    expect(m.candlesRecent).toHaveBeenCalledTimes(1);
    expect(bars.map((b) => b.timestamp)).toEqual([300, 500]);
  });
});

describe("normalizeBackwardList", () => {
  it("sorts ascending and drops duplicate timestamps", () => {
    const bars = [
      { timestamp: 500, open: 1, high: 2, low: 0, close: 1, volume: 1 },
      { timestamp: 500, open: 3, high: 4, low: 0, close: 3, volume: 1 },
      { timestamp: 100, open: 1, high: 2, low: 0, close: 1, volume: 1 },
    ];
    const out = normalizeBackwardList(bars);
    expect(out.map((b) => b.timestamp)).toEqual([100, 500]);
  });

  it("drops bars newer than maxTimestamp", () => {
    const bars = [
      { timestamp: 500, open: 1, high: 2, low: 0, close: 1, volume: 1 },
      { timestamp: 300, open: 1, high: 2, low: 0, close: 1, volume: 1 },
    ];
    const out = normalizeBackwardList(bars, 400);
    expect(out.map((b) => b.timestamp)).toEqual([300]);
  });
});
