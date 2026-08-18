// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { ExchangeSocket } from "./useExchangeSocket";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  sent: string[] = [];
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  readyState = 1;

  constructor() {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.onclose?.(new Event("close"));
  }

  emitOpen(): void {
    this.onopen?.(new Event("open"));
  }

  emitFrame(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
}

let originalWS: typeof WebSocket;

beforeEach(() => {
  originalWS = globalThis.WebSocket;
  FakeWebSocket.instances = [];
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
    FakeWebSocket as unknown as typeof WebSocket;
});

function teardown(sock: ExchangeSocket): void {
  sock.teardown();
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWS;
}

describe("ExchangeSocket wildcard delivery", () => {
  it("delivers a per-instId ticker frame to a wildcard (default) subscriber", () => {
    const sock = new ExchangeSocket();
    const received: unknown[] = [];
    sock.subscribe({ channel: "ticker", symbol: "default", category: "USDT-FUTURES" }, (f) =>
      received.push(f),
    );
    FakeWebSocket.instances[0].emitOpen();
    // backend pushes a per-instId update frame (symbol=BTCUSDT)
    FakeWebSocket.instances[0].emitFrame({
      channel: "ticker",
      symbol: "BTCUSDT",
      category: "USDT-FUTURES",
      action: "update",
      data: [{ instId: "BTCUSDT", lastPr: "64000" }],
    });
    expect(received).toHaveLength(1);
    teardown(sock);
  });

  it("does not deliver another category's frame to a wildcard subscriber", () => {
    const sock = new ExchangeSocket();
    const received: unknown[] = [];
    sock.subscribe({ channel: "ticker", symbol: "default", category: "USDT-FUTURES" }, (f) =>
      received.push(f),
    );
    FakeWebSocket.instances[0].emitOpen();
    FakeWebSocket.instances[0].emitFrame({
      channel: "ticker",
      symbol: "BTCUSDT",
      category: "SPOT",
      action: "update",
      data: [{ instId: "BTCUSDT", lastPr: "1" }],
    });
    expect(received).toHaveLength(0);
    teardown(sock);
  });

  it("delivers any category's frame to a category-wildcard subscriber", () => {
    const sock = new ExchangeSocket();
    const received: unknown[] = [];
    sock.subscribe({ channel: "ticker", symbol: "default", category: "*" }, (f) =>
      received.push(f),
    );
    FakeWebSocket.instances[0].emitOpen();
    FakeWebSocket.instances[0].emitFrame({
      channel: "ticker",
      symbol: "BTCUSDT",
      category: "SPOT",
      action: "update",
      data: [{ instId: "BTCUSDT", lastPr: "1" }],
    });
    expect(received).toHaveLength(1);
    teardown(sock);
  });

  it("keeps exact subscriptions precise (no wildcard leak)", () => {
    const sock = new ExchangeSocket();
    const btc: unknown[] = [];
    const eth: unknown[] = [];
    sock.subscribe({ channel: "ticker", symbol: "BTCUSDT", category: "USDT-FUTURES" }, (f) =>
      btc.push(f),
    );
    sock.subscribe({ channel: "ticker", symbol: "ETHUSDT", category: "USDT-FUTURES" }, (f) =>
      eth.push(f),
    );
    FakeWebSocket.instances[0].emitOpen();
    FakeWebSocket.instances[0].emitFrame({
      channel: "ticker",
      symbol: "BTCUSDT",
      category: "USDT-FUTURES",
      action: "update",
      data: [{ instId: "BTCUSDT", lastPr: "64000" }],
    });
    expect(btc).toHaveLength(1);
    expect(eth).toHaveLength(0);
    teardown(sock);
  });
});
