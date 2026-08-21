// @vitest-environment jsdom
// Regression tests for the global-news SSE stream that exercise the REAL
// useGlobalNewsStream hook (no module mock) so lost-`this` binding bugs in
// GlobalNewsClient surface as failures instead of white-screening the page.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { GlobalNewsFeed } from "./GlobalNewsFeed";
import { api } from "../../api/client";
import type { GlobalNewsItem } from "../../types/trading";

vi.mock("../../api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../api/client")>();
  return {
    ...mod,
    api: {
      ...mod.api,
      newsCategories: vi.fn().mockResolvedValue({ categories: ["crypto", "macro"] }),
      newsHistory: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    },
  };
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

function item(
  id: string,
  title = `标题-${id}`,
  category: GlobalNewsItem["category"] = "crypto",
): GlobalNewsItem {
  return { id, source: "em", category, title, content: "", url: null, ts: 1_700_000_000 };
}

describe("GlobalNewsFeed real stream integration", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
    vi.mocked(api.newsHistory).mockReset();
    vi.mocked(api.newsHistory).mockResolvedValue({ items: [], total: 0 });
  });

  afterEach(() => {
    delete (globalThis as unknown as { EventSource: unknown }).EventSource;
  });

  it("auto-flushes a live item at the top without crashing (real hook)", async () => {
    render(<GlobalNewsFeed theme="dark" />);

    const es = FakeEventSource.instances[0];
    expect(es).toBeTruthy();
    act(() => {
      es.emit("snapshot", { items: [item("s1")], sources: {}, total: 1 });
    });
    await screen.findByText("标题-s1");

    // live item lands in `pending`; atTop (no scroll container) -> auto flush
    act(() => {
      es.emit("item", item("live"));
    });
    await screen.findByText("标题-live");

    // the tree is still alive and both cards coexist
    expect(screen.getByText("标题-s1")).toBeTruthy();
  });

  it("loadMore appends older history via the fallback button (real hook)", async () => {
    vi.mocked(api.newsHistory).mockResolvedValue({
      items: [item("old1", "旧条目-1")],
      total: 300,
    });
    render(<GlobalNewsFeed theme="dark" />);

    const es = FakeEventSource.instances[0];
    act(() => {
      es.emit("snapshot", { items: [item("s1")], sources: {}, total: 300 });
    });

    // jsdom has no IntersectionObserver -> fallback "加载更早" button
    const button = await screen.findByTestId("load-earlier-button");
    act(() => {
      button.click();
    });

    await screen.findByText("旧条目-1");
    expect(api.newsHistory).toHaveBeenCalledWith(1, 100, undefined);
  });

  it("category view keeps loading older items without a premature all-loaded", async () => {
    // Backend ring: 100 items total, 6 of them crypto. The client's first page
    // only carries 2 crypto items, and each paged load returns 2 more. The
    // old bug compared the FULL list length against the category-filtered
    // total, flipping hasMore false after the first page (premature all-loaded).
    vi.mocked(api.newsHistory).mockResolvedValue({
      items: [item("oldc1", "旧分类-1", "crypto"), item("oldc2", "旧分类-2", "crypto")],
      total: 6,
    });
    render(<GlobalNewsFeed theme="dark" />);

    const es = FakeEventSource.instances[0];
    act(() => {
      es.emit("snapshot", {
        items: [
          item("c1", "标题-c1", "crypto"),
          item("c2", "标题-c2", "crypto"),
          item("m1", "标题-m1", "macro"),
          item("m2", "标题-m2", "macro"),
          item("m3", "标题-m3", "macro"),
        ],
        sources: {},
        total: 100,
      });
    });

    fireEvent.click(await screen.findByRole("button", { name: "加密" }));

    const button = await screen.findByTestId("load-earlier-button");
    act(() => {
      button.click();
    });

    await screen.findByText("旧分类-1");
    expect(screen.getByText("旧分类-2")).toBeTruthy();
    // 4 crypto buffered < 6 total -> more remains, feed must NOT say all-loaded
    expect(screen.queryByTestId("all-loaded")).toBeNull();
    expect(api.newsHistory).toHaveBeenCalledWith(2, 100, "crypto");
  });
});
