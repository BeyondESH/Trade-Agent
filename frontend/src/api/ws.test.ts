// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnStatus } from "./ws";
import { connectSnapshot } from "./ws";
import type { Snapshot } from "./types";

type Handler<T = Event> = ((ev: T) => void) | null;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onopen: Handler | null = null;
  onmessage: Handler<MessageEvent> | null = null;
  onclose: Handler | null = null;
  onerror: Handler | null = null;
  closed = false;
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.closed = true;
    this.onclose?.(new Event("close"));
  }

  emitOpen(): void {
    this.onopen?.(new Event("open"));
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  emitClose(): void {
    this.onclose?.(new Event("close"));
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

const SERIES = { category: "USDT-FUTURES", symbol: "BTCUSDT", timeframe: "5m" };

describe("connectSnapshot reconnect", () => {
  it("reconnects after an unexpected close and keeps receiving", () => {
    const onMsg = vi.fn<(snap: Snapshot) => void>();
    const conn = connectSnapshot(SERIES, onMsg);
    expect(FakeWebSocket.instances).toHaveLength(1);

    const first = FakeWebSocket.instances[0];
    first.emitOpen();
    first.emitMessage({ last_candle: { open_time: 1, open: 1, high: 2, low: 0, close: 3, volume: 1 } });
    expect(onMsg).toHaveBeenCalledTimes(1);

    first.emitClose();
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(2);

    const second = FakeWebSocket.instances[1];
    second.emitOpen();
    second.emitMessage({ last_candle: { open_time: 2, open: 1, high: 2, low: 0, close: 4, volume: 1 } });
    expect(onMsg).toHaveBeenCalledTimes(2);

    conn.close();
  });

  it("re-subscribes via the same URL on reconnect", () => {
    const conn = connectSnapshot(SERIES, () => {});
    FakeWebSocket.instances[0].emitOpen();
    FakeWebSocket.instances[0].emitClose();
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances[1].url).toBe(FakeWebSocket.instances[0].url);
    conn.close();
  });

  it("does not reconnect after a manual close", () => {
    const conn = connectSnapshot(SERIES, () => {});
    FakeWebSocket.instances[0].emitOpen();
    conn.close();
    vi.advanceTimersByTime(10_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].closed).toBe(true);
  });

  it("backoff delay increases on repeated failures", () => {
    const conn = connectSnapshot(SERIES, () => {});
    FakeWebSocket.instances[0].emitOpen();

    FakeWebSocket.instances[0].emitClose();
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);

    FakeWebSocket.instances[1].emitClose();
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);

    conn.close();
  });

  it("reports status transitions live / reconnecting / closed", () => {
    const states: ConnStatus[] = [];
    const conn = connectSnapshot(SERIES, () => {}, 5, (s) => states.push(s));
    FakeWebSocket.instances[0].emitOpen();
    FakeWebSocket.instances[0].emitClose();
    vi.advanceTimersByTime(500);
    FakeWebSocket.instances[1].emitOpen();
    conn.close();
    expect(states).toEqual(["live", "reconnecting", "live", "closed"]);
  });
});
