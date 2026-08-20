// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BitgetWsClient, bitgetWs } from "./bitgetWs";
import type { Candle } from "./types";

type Handler<T = Event> = ((ev: T) => void) | null;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  sent: string[] = [];
  onopen: Handler | null = null;
  onmessage: Handler<MessageEvent> | null = null;
  onclose: Handler | null = null;
  onerror: Handler | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.onclose?.(new Event("close"));
  }

  emitOpen(): void {
    this.onopen?.(new Event("open"));
  }

  emitMessage(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }

  emitClose(): void {
    this.onclose?.(new Event("close"));
  }

  /** Parsed frames sent over this socket. */
  frames(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
}

let originalWS: typeof WebSocket;

beforeEach(() => {
  vi.useFakeTimers();
  originalWS = globalThis.WebSocket;
  FakeWebSocket.instances = [];
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
    FakeWebSocket as unknown as typeof WebSocket;
});

afterEach(() => {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWS;
  vi.useRealTimers();
});

const A = { category: "USDT-FUTURES", symbol: "BTCUSDT", timeframe: "5m" };
const B = { category: "USDT-FUTURES", symbol: "ETHUSDT", timeframe: "1h" };

const candle = (open_time: number, close = 3): Candle => ({
  open_time,
  open: 1,
  high: 2,
  low: 0,
  close,
  volume: 1,
});

const candleFrame = (symbol: string, category: string, timeframe: string, c: Candle) => ({
  channel: "candle",
  symbol,
  category,
  timeframe,
  action: "update",
  data: { last_candle: c },
});

describe("BitgetWsClient single shared socket", () => {
  it("opens one socket and sends a candle subscribe frame per series on open", () => {
    const c = new BitgetWsClient();
    c.subscribe(A, () => {});
    c.subscribe(B, () => {});
    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0].emitOpen();
    const subs = FakeWebSocket.instances[0]
      .frames()
      .filter((f) => f.op === "subscribe") as Array<{ op: string; args: unknown[] }>;
    expect(subs).toHaveLength(2);
    expect(subs[0].args[0]).toMatchObject({ channel: "candle", symbol: "BTCUSDT", timeframe: "5m" });
    expect(subs[1].args[0]).toMatchObject({ channel: "candle", symbol: "ETHUSDT", timeframe: "1h" });
  });

  it("dedupes listeners on the same series into one subscription", () => {
    const c = new BitgetWsClient();
    const l1 = vi.fn();
    const l2 = vi.fn();
    c.subscribe(A, l1);
    c.subscribe(A, l2);
    FakeWebSocket.instances[0].emitOpen();
    const subs = FakeWebSocket.instances[0].frames().filter((f) => f.op === "subscribe");
    expect(subs).toHaveLength(1);
    FakeWebSocket.instances[0].emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "5m", candle(1000)));
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes the series only when the last listener leaves", () => {
    const c = new BitgetWsClient();
    const l1 = vi.fn();
    const l2 = vi.fn();
    const h1 = c.subscribe(A, l1);
    const h2 = c.subscribe(A, l2);
    FakeWebSocket.instances[0].emitOpen();
    h1.close();
    expect(FakeWebSocket.instances[0].frames().filter((f) => f.op === "unsubscribe")).toHaveLength(0);
    h2.close();
    expect(FakeWebSocket.instances[0].frames().filter((f) => f.op === "unsubscribe")).toHaveLength(1);
  });
});

describe("BitgetWsClient delivery", () => {
  it("maps last_candle from the candle channel to listeners only for the matching series", () => {
    const c = new BitgetWsClient();
    const btc = vi.fn();
    const eth = vi.fn();
    c.subscribe(A, btc);
    c.subscribe(B, eth);
    const sock = FakeWebSocket.instances[0];
    sock.emitOpen();
    sock.emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "5m", candle(1000, 5)));
    expect(btc).toHaveBeenCalledWith(expect.objectContaining({ open_time: 1000, close: 5 }));
    expect(eth).not.toHaveBeenCalled();
  });

  it("does not re-deliver an identical candle (quiet market)", () => {
    const c = new BitgetWsClient();
    const cb = vi.fn();
    c.subscribe(A, cb);
    const sock = FakeWebSocket.instances[0];
    sock.emitOpen();
    sock.emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "5m", candle(1000)));
    sock.emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "5m", candle(1000)));
    expect(cb).toHaveBeenCalledTimes(1);
    // a changed bucket is delivered again
    sock.emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "5m", candle(1000, 9)));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("routes by timeframe: a 5m bar never reaches a 1h subscriber", () => {
    const c = new BitgetWsClient();
    const five = vi.fn();
    const hour = vi.fn();
    c.subscribe({ category: "USDT-FUTURES", symbol: "BTCUSDT", timeframe: "5m" }, five);
    c.subscribe({ category: "USDT-FUTURES", symbol: "BTCUSDT", timeframe: "1h" }, hour);
    const sock = FakeWebSocket.instances[0];
    sock.emitOpen();
    // 5m bar arrives
    sock.emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "5m", candle(1000, 5)));
    expect(five).toHaveBeenCalledTimes(1);
    expect(hour).not.toHaveBeenCalled();
    // 1h bar arrives
    sock.emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "1h", candle(2000, 7)));
    expect(hour).toHaveBeenCalledTimes(1);
    expect(five).toHaveBeenCalledTimes(1);
  });

  it("ignores candle frames missing the full series identity", () => {
    const c = new BitgetWsClient();
    const cb = vi.fn();
    c.subscribe(A, cb);
    const sock = FakeWebSocket.instances[0];
    sock.emitOpen();
    // missing timeframe -> cannot route safely -> ignored
    sock.emitMessage({ channel: "candle", symbol: "BTCUSDT", category: "USDT-FUTURES",
                       action: "update", data: { last_candle: candle(1000) } });
    expect(cb).not.toHaveBeenCalled();
  });

  it("ignores non-candle frames and frames without last_candle", () => {
    const c = new BitgetWsClient();
    const cb = vi.fn();
    c.subscribe(A, cb);
    const sock = FakeWebSocket.instances[0];
    sock.emitOpen();
    sock.emitMessage({ channel: "ticker", symbol: "BTCUSDT", data: {} });
    sock.emitMessage({ channel: "candle", symbol: "BTCUSDT", category: "USDT-FUTURES",
                       timeframe: "5m", data: {} });
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("BitgetWsClient reconnect", () => {
  it("reconnects and re-subscribes every active series exactly once", () => {
    const c = new BitgetWsClient();
    c.subscribe(A, () => {});
    c.subscribe(B, () => {});
    const first = FakeWebSocket.instances[0];
    first.emitOpen();
    first.emitClose();
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(2);
    const second = FakeWebSocket.instances[1];
    const before = second.frames().filter((f) => f.op === "subscribe");
    expect(before).toHaveLength(0); // nothing until open
    second.emitOpen();
    const subs = second.frames().filter((f) => f.op === "subscribe");
    expect(subs).toHaveLength(2); // each active series once
  });

  it("increases backoff on repeated failures and stops reconnecting after teardown", () => {
    const c = new BitgetWsClient();
    c.subscribe(A, () => {});
    const first = FakeWebSocket.instances[0];
    first.emitOpen();
    first.emitClose();
    // first retry after 500ms
    vi.advanceTimersByTime(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    c.teardown();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(2); // no further reconnects
  });
});

describe("BitgetWsClient status", () => {
  it("reports live on open, reconnecting on unexpected close, closed on teardown", () => {
    const c = new BitgetWsClient();
    const states: string[] = [];
    c.onStatus((s) => states.push(s));
    c.subscribe(A, () => {});
    const first = FakeWebSocket.instances[0];
    first.emitOpen();
    first.emitClose();
    vi.advanceTimersByTime(500);
    FakeWebSocket.instances[1].emitOpen();
    c.teardown();
    expect(states).toEqual(["live", "reconnecting", "live", "closed"]);
  });
});

describe("bitgetWs shared instance", () => {
  it("is exported as a ready-made client", () => {
    expect(bitgetWs).toBeInstanceOf(BitgetWsClient);
    expect(typeof bitgetWs.subscribe).toBe("function");
  });
});

describe("BitgetWsClient monotonicity guard", () => {
  it("drops a stale frame whose open_time is older than the last delivered bar", () => {
    const c = new BitgetWsClient();
    const cb = vi.fn();
    c.subscribe(A, cb);
    const sock = FakeWebSocket.instances[0];
    sock.emitOpen();
    sock.emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "5m", candle(2000, 5)));
    expect(cb).toHaveBeenCalledTimes(1);
    // a frame arriving out-of-order with an older bucket must not append
    sock.emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "5m", candle(1000, 7)));
    expect(cb).toHaveBeenCalledTimes(1); // unchanged: stale dropped
    expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ open_time: 2000 }));
  });

  it("still replaces the current bucket when a same-open_time, changed bar arrives", () => {
    const c = new BitgetWsClient();
    const cb = vi.fn();
    c.subscribe(A, cb);
    const sock = FakeWebSocket.instances[0];
    sock.emitOpen();
    sock.emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "5m", candle(2000, 5)));
    sock.emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "5m", candle(2000, 9)));
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ open_time: 2000, close: 9 }));
  });

  it("appends a new, later bucket", () => {
    const c = new BitgetWsClient();
    const cb = vi.fn();
    c.subscribe(A, cb);
    const sock = FakeWebSocket.instances[0];
    sock.emitOpen();
    sock.emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "5m", candle(2000, 5)));
    sock.emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "5m", candle(3000, 8)));
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ open_time: 3000, close: 8 }));
  });

  it("does not misjudge a fresh series whose first bar precedes a different series' bar", () => {
    const c = new BitgetWsClient();
    const five = vi.fn();
    const hour = vi.fn();
    c.subscribe({ category: "USDT-FUTURES", symbol: "BTCUSDT", timeframe: "5m" }, five);
    c.subscribe({ category: "USDT-FUTURES", symbol: "BTCUSDT", timeframe: "1h" }, hour);
    const sock = FakeWebSocket.instances[0];
    sock.emitOpen();
    // 1h series sees an early bar first; the 5m series is independent.
    sock.emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "1h", candle(1000, 1)));
    expect(hour).toHaveBeenCalledTimes(1);
    // a 5m bar with a smaller open_time than the 1h bar is valid for its own series
    sock.emitMessage(candleFrame("BTCUSDT", "USDT-FUTURES", "5m", candle(500, 2)));
    expect(five).toHaveBeenCalledTimes(1);
    expect(five).toHaveBeenCalledWith(expect.objectContaining({ open_time: 500 }));
  });
});
