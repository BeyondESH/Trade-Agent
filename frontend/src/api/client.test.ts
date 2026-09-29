import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResearchStreamEvent } from "./types";
import { ApiError, api } from "./client";

class FakeEventSource {
  static last: FakeEventSource | null = null;
  url: string;
  closed = false;
  listeners = new Map<string, Set<(e: { data: string }) => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }

  addEventListener(type: string, cb: (e: { data: string }) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(cb);
    this.listeners.set(type, set);
  }

  emit(type: string, data: string) {
    const cbs = this.listeners.get(type);
    if (!cbs) return;
    for (const cb of cbs) cb({ data });
  }

  close() {
    this.closed = true;
  }
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: "err",
      json: async () => body,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("parses JSON on 2xx", async () => {
    mockFetch(200, { price: 100, indicators: {}, levels: [] });
    const r = await api.analyze({
      category: "USDT-FUTURES",
      symbol: "BTCUSDT",
      timeframe: "5m",
    });
    expect(r.price).toBe(100);
  });

  it("throws ApiError on non-2xx with detail", async () => {
    mockFetch(422, { detail: "insufficient data" });
    await expect(
      api.analyze({
        category: "USDT-FUTURES",
        symbol: "BTCUSDT",
        timeframe: "5m",
      }),
    ).rejects.toMatchObject({ status: 422, message: "insufficient data" });
  });

  it("ApiError is an Error subclass", () => {
    expect(new ApiError(400, "x")).toBeInstanceOf(Error);
  });

  it("builds research proposal list/detail and execution run requests", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      statusText: "ok",
      json: async () => ({ proposals: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const lastUrl = () => fetchMock.mock.calls.at(-1)?.[0];

    await api.researchProposals({ symbol: "BTCUSDT", limit: 10 });
    expect(lastUrl()).toBe("/api/research/proposals?symbol=BTCUSDT&limit=10");

    await api.researchProposal("p 1");
    expect(lastUrl()).toBe("/api/research/proposals/p%201");

    await api.executionRun("run/2");
    expect(lastUrl()).toBe("/api/executions/run%2F2");
  });
});

describe("research SSE stream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches parsed frames and closes on a terminal frame", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const events: ResearchStreamEvent[] = [];
    const onOpen = vi.fn();

    api.openResearchStream("exec:abc", { onEvent: (e) => events.push(e), onOpen });
    const es = FakeEventSource.last;
    if (!es) throw new Error("EventSource not created");
    expect(es.url).toBe("/api/research/exec%3Aabc/stream");

    es.emit("node", JSON.stringify({ type: "node", node: "risk_gate" }));
    expect(events).toEqual([{ type: "node", node: "risk_gate" }]);

    // malformed frame is ignored, not thrown
    es.emit("message", "not-json");
    expect(events).toHaveLength(1);

    es.emit("done", JSON.stringify({ type: "done", status: "succeeded" }));
    expect(events[1]).toEqual({ type: "done", status: "succeeded" });
    expect(es.closed).toBe(true);
  });

  it("closes the connection via the returned handle", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const handle = api.openResearchStream("research:1", { onEvent: vi.fn() });
    const es = FakeEventSource.last;
    if (!es) throw new Error("EventSource not created");
    handle.close();
    expect(es.closed).toBe(true);
  });
});
