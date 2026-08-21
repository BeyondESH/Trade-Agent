import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { GlobalNewsItem } from "../types/trading";
import { api } from "../api/client";
import {
  NEWS_WINDOW_SIZE,
  REVEAL_CHUNK,
  GlobalNewsClient,
  allSourcesUnavailable,
  formatNewsTime,
} from "./globalNews";

vi.mock("../api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../api/client")>();
  return { ...mod, api: { ...mod.api, newsHistory: vi.fn() } };
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  listeners = new Map<string, Set<(e: { data: string }) => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (e: { data: string }) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(cb);
    this.listeners.set(type, set);
  }

  emit(type: string, data: unknown) {
    const cbs = this.listeners.get(type);
    if (!cbs) return;
    for (const cb of cbs) cb({ data: JSON.stringify(data) });
  }

  close() {
    this.closed = true;
  }
}

let originalES: typeof EventSource;

beforeEach(() => {
  FakeEventSource.instances = [];
  originalES = globalThis.EventSource;
  (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
    FakeEventSource as unknown as typeof EventSource;
});

afterEach(() => {
  (globalThis as unknown as { EventSource: typeof EventSource }).EventSource = originalES;
  vi.mocked(api.newsHistory).mockReset();
});

function item(id: string, category: GlobalNewsItem["category"] = "crypto"): GlobalNewsItem {
  return { id, source: "em", category, title: `t-${id}`, content: "", url: null, ts: 1_700_000_000 };
}

describe("GlobalNewsClient", () => {
  it("connects and tracks open/closed state", () => {
    const client = new GlobalNewsClient("/api/news/stream");
    client.connect();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe("/api/news/stream");
    expect(client.state).toBe("connecting");

    FakeEventSource.instances[0].onopen?.();
    expect(client.state).toBe("open");

    client.close();
    expect(client.state).toBe("closed");
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it("keeps snapshot items newest-first in the given order", () => {
    const client = new GlobalNewsClient();
    client.connect();
    const es = FakeEventSource.instances[0];

    es.emit("snapshot", { items: [item("n1"), item("n2"), item("n3")], sources: {} });
    expect(client.items.map((i) => i.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("buffers live items in pending until flushed (newest-first prepend)", () => {
    const client = new GlobalNewsClient();
    client.connect();
    const es = FakeEventSource.instances[0];

    es.emit("snapshot", { items: [item("n1"), item("n2")], sources: {} });
    es.emit("item", item("n0"));
    expect(client.pendingCount).toBe(1);
    expect(client.items.map((i) => i.id)).toEqual(["n1", "n2"]);

    const flushed = client.flushPending();
    expect(flushed.map((i) => i.id)).toEqual(["n0"]);
    expect(client.items.map((i) => i.id)).toEqual(["n0", "n1", "n2"]);
    expect(client.pendingCount).toBe(0);
  });

  it("flushes multiple pending items newest-first", () => {
    const client = new GlobalNewsClient();
    client.connect();
    const es = FakeEventSource.instances[0];

    es.emit("snapshot", { items: [item("b")], sources: {} });
    es.emit("item", item("c1"));
    es.emit("item", item("c0"));
    client.flushPending();
    expect(client.items.map((i) => i.id)).toEqual(["c0", "c1", "b"]);
  });

  it("dedups replay duplicates after a reconnect", () => {
    const client = new GlobalNewsClient();
    client.connect();
    const es = FakeEventSource.instances[0];

    es.emit("snapshot", { items: [item("a"), item("b")], sources: {} });
    // EventSource dropped; backend replays the snapshot on reconnect.
    es.emit("snapshot", { items: [item("a"), item("b"), item("c")], sources: {} });

    expect(client.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(client.items).toHaveLength(3);
  });

  it("rebuilds authoritative order and clears pending on reconnect snapshot", () => {
    const client = new GlobalNewsClient();
    client.connect();
    const es = FakeEventSource.instances[0];

    es.emit("snapshot", { items: [item("a"), item("b")], sources: {}, total: 2 });
    es.emit("item", item("z"));
    expect(client.pendingCount).toBe(1);

    es.emit("snapshot", { items: [item("z"), item("a"), item("b")], sources: {}, total: 3 });
    expect(client.pendingCount).toBe(0);
    expect(client.items.map((i) => i.id)).toEqual(["z", "a", "b"]);
  });

  it("tracks hasMore from the snapshot total", () => {
    const client = new GlobalNewsClient();
    client.connect();
    const es = FakeEventSource.instances[0];

    es.emit("snapshot", { items: [item("a")], sources: {}, total: 200 });
    expect(client.hasMore).toBe(true);

    es.emit("snapshot", { items: [item("a")], sources: {}, total: 1 });
    expect(client.hasMore).toBe(false);
  });

  it("loadMore pages older history from the backend and appends it", async () => {
    vi.mocked(api.newsHistory).mockResolvedValue({
      items: [item("h1"), item("h2")],
      total: 3,
    });
    const client = new GlobalNewsClient();
    client.connect();
    FakeEventSource.instances[0].emit("snapshot", { items: [item("a")], sources: {}, total: 3 });

    await client.loadMore();
    expect(api.newsHistory).toHaveBeenCalledWith(1, 100, undefined);
    expect(client.items.map((i) => i.id)).toEqual(["a", "h1", "h2"]);
    expect(client.hasMore).toBe(false); // 3 == total
  });

  it("loadMore offsets include buffered pending items", async () => {
    vi.mocked(api.newsHistory).mockResolvedValue({ items: [], total: 1 });
    const client = new GlobalNewsClient();
    client.connect();
    const es = FakeEventSource.instances[0];
    es.emit("snapshot", { items: [item("a")], sources: {}, total: 2 });
    es.emit("item", item("z"));

    await client.loadMore("crypto");
    expect(api.newsHistory).toHaveBeenCalledWith(2, 100, "crypto");
  });

  it("loadMore(category) offsets by that category's buffered count, not the full list", async () => {
    vi.mocked(api.newsHistory).mockResolvedValue({
      items: [item("h1", "crypto"), item("h2", "crypto")],
      total: 5,
    });
    const client = new GlobalNewsClient();
    client.connect();
    FakeEventSource.instances[0].emit("snapshot", {
      items: [item("a", "crypto"), item("b", "crypto"), item("c", "crypto"), item("x", "macro")],
      sources: {},
      total: 20,
    });

    await client.loadMore("crypto");
    // 3 crypto items buffered -> offset 3 (the full list has 4, which would
    // wrongly slice past the category's filtered list).
    expect(api.newsHistory).toHaveBeenCalledWith(3, 100, "crypto");
    expect(client.hasMoreFor("crypto")).toBe(false); // 5 buffered == total 5
    expect(client.hasMore).toBe(true); // full feed still pages (6 < 20)
  });

  it("loadMore(category) does not exhaust the full feed or other categories", async () => {
    vi.mocked(api.newsHistory).mockResolvedValue({ items: [], total: 9 });
    const client = new GlobalNewsClient();
    client.connect();
    FakeEventSource.instances[0].emit("snapshot", {
      items: [item("a", "crypto"), item("b", "crypto"), item("m1", "macro"), item("m2", "macro")],
      sources: {},
      total: 30,
    });

    await client.loadMore("crypto"); // buffered 2 < total 9 -> more crypto remains
    expect(client.hasMoreFor("crypto")).toBe(true);
    expect(client.hasMoreFor("macro")).toBe(true); // falls back to global
    expect(client.hasMore).toBe(true);
  });

  it("snapshot replay resets per-category hasMore to the fresh global flag", async () => {
    vi.mocked(api.newsHistory).mockResolvedValue({ items: [], total: 3 });
    const client = new GlobalNewsClient();
    client.connect();
    const es = FakeEventSource.instances[0];
    es.emit("snapshot", { items: [item("a", "crypto"), item("b", "crypto")], sources: {}, total: 10 });
    await client.loadMore("crypto"); // 2 buffered < 3 -> still more
    expect(client.hasMoreFor("crypto")).toBe(true);

    es.emit("snapshot", { items: [item("a", "crypto"), item("b", "crypto")], sources: {}, total: 2 });
    expect(client.hasMoreFor("crypto")).toBe(false); // global exhausted -> fallback false
  });

  it("exposes source health from the snapshot", () => {
    const client = new GlobalNewsClient();
    client.connect();
    FakeEventSource.instances[0].emit("snapshot", {
      items: [],
      sources: { em: { last_ts: 123, last_error: null, failures: 0 } },
    });
    expect(client.sources.em.last_ts).toBe(123);
  });
});

describe("window constants", () => {
  it("exports the window size and reveal chunk", () => {
    expect(NEWS_WINDOW_SIZE).toBe(100);
    expect(REVEAL_CHUNK).toBe(100);
  });
});

describe("allSourcesUnavailable", () => {
  it("is false while there is no health info yet", () => {
    expect(allSourcesUnavailable({})).toBe(false);
  });

  it("is true only when every source failed and none succeeded", () => {
    expect(
      allSourcesUnavailable({
        em: { last_ts: null, last_error: "x", failures: 2 },
        sina: { last_ts: null, last_error: "y", failures: 1 },
      }),
    ).toBe(true);
  });

  it("is false when at least one source succeeded", () => {
    expect(
      allSourcesUnavailable({
        em: { last_ts: 5, last_error: null, failures: 0 },
        sina: { last_ts: null, last_error: "y", failures: 1 },
      }),
    ).toBe(false);
  });
});

describe("formatNewsTime", () => {
  it("returns a display string for an epoch ts", () => {
    expect(typeof formatNewsTime(1_700_000_000, Date.now())).toBe("string");
  });
});
