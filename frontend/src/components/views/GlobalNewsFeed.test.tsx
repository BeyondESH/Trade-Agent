// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { GlobalNewsFeed } from "./GlobalNewsFeed";
import type { GlobalNewsItem } from "../../types/trading";

const state = vi.hoisted(() => ({
  items: [] as GlobalNewsItem[],
  pending: [] as GlobalNewsItem[],
  state: "open" as "open" | "connecting" | "closed",
  sources: {} as Record<string, { last_ts: number | null; last_error: string | null; failures: number }>,
  hasMore: false,
}));

vi.mock("../../lib/globalNews", () => ({
  useGlobalNewsStream: () => ({
    items: state.items,
    state: state.state,
    sources: state.sources,
    pendingCount: state.pending.length,
    flushPending: () => {
      const out = state.pending;
      state.pending = [];
      state.items = [...out, ...state.items];
      return out;
    },
    hasMore: () => state.hasMore,
    loadMore: vi.fn().mockResolvedValue(undefined),
  }),
  fetchNewsCategories: vi.fn().mockResolvedValue(["crypto", "macro", "policy"]),
  allSourcesUnavailable: (sources: Record<string, { last_ts: number | null; last_error: string | null }>) => {
    const entries = Object.values(sources);
    return entries.length > 0 && entries.every((s) => !!s.last_error) && entries.every((s) => s.last_ts == null);
  },
  formatNewsTime: (ts: number) => `T${ts}`,
  NEWS_WINDOW_SIZE: 100,
  REVEAL_CHUNK: 100,
}));

function mk(id: string, category: string, content = ""): GlobalNewsItem {
  return {
    id,
    source: "em",
    category: category as GlobalNewsItem["category"],
    title: `标题-${id}`,
    content,
    url: null,
    ts: 1,
  };
}

function renderFeed() {
  return render(<GlobalNewsFeed theme="dark" />);
}

function scrollElement() {
  return (
    <div id="news-calendar-view" style={{ overflow: "auto", height: "300px" }}>
      <GlobalNewsFeed theme="dark" />
    </div>
  );
}

function renderFeedInScroll() {
  return render(scrollElement());
}

describe("GlobalNewsFeed", () => {
  beforeEach(() => {
    state.items = [];
    state.pending = [];
    state.state = "open";
    state.sources = {};
    state.hasMore = false;
  });

  it("renders chips from /news/categories", async () => {
    renderFeed();
    expect(await screen.findByText("全部")).toBeTruthy();
    expect(screen.getByText("加密")).toBeTruthy();
    expect(screen.getByText("宏观")).toBeTruthy();
    expect(screen.getByText("政策")).toBeTruthy();
  });

  it("filters the feed by the selected category", async () => {
    state.items = [mk("1", "crypto"), mk("2", "macro")];
    renderFeed();
    expect(await screen.findByText("标题-1")).toBeTruthy();
    expect(screen.getByText("标题-2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "加密" }));
    expect(screen.getByText("标题-1")).toBeTruthy();
    expect(screen.queryByText("标题-2")).toBeNull();

    // clicking the active chip clears the filter
    fireEvent.click(screen.getByRole("button", { name: "加密" }));
    expect(screen.getByText("标题-2")).toBeTruthy();
  });

  it("shows the unavailable banner when every source failed", async () => {
    state.sources = { em: { last_ts: null, last_error: "x", failures: 1 } };
    renderFeed();
    expect(await screen.findByText("新闻源暂不可用")).toBeTruthy();
  });

  it("renders a source badge and category badge per item", async () => {
    state.items = [mk("1", "crypto")];
    renderFeed();
    expect(await screen.findByText("em")).toBeTruthy();
    // "加密" appears both as a filter chip and as the item's category badge.
    expect(screen.getAllByText("加密").length).toBeGreaterThanOrEqual(2);
  });

  it("renders items into masonry columns with the full content", async () => {
    state.items = [mk("1", "crypto"), mk("2", "macro", "这是一段很长的正文内容，应该被完整展示，不能截断。")];
    renderFeed();
    expect(await screen.findByText("标题-1")).toBeTruthy();
    expect(screen.getByText("标题-2")).toBeTruthy();
    expect(screen.getByText("这是一段很长的正文内容，应该被完整展示，不能截断。")).toBeTruthy();

    const columns = screen.getByTestId("global-news-columns");
    expect(columns.querySelectorAll('[data-testid^="column-"]').length).toBe(2);
  });

  it("auto-flushes pending items when at the top (no pill)", async () => {
    state.items = [mk("1", "crypto")];
    const { rerender } = renderFeed();

    state.pending = [mk("new", "crypto")];
    rerender(<GlobalNewsFeed theme="dark" />); // effect flushes pending into items
    await screen.findByText("标题-new"); // masonry re-render lands asynchronously

    expect(screen.queryByTestId("new-items-pill")).toBeNull();
  });

  it("buffers pending items into a pill when scrolled and flushes on click", async () => {
    state.items = [mk("1", "crypto")];
    const { rerender } = renderFeedInScroll();
    const container = document.getElementById("news-calendar-view")!;
    container.scrollTop = 200;
    fireEvent.scroll(container);

    state.pending = [mk("new", "crypto")];
    await act(async () => {
      rerender(scrollElement());
    });

    const pill = await screen.findByTestId("new-items-pill");
    expect(pill.textContent).toContain("1 条新快讯");
    expect(screen.queryByText("标题-new")).toBeNull();

    fireEvent.click(pill);
    await act(async () => {
      rerender(scrollElement());
    });

    await screen.findByText("标题-new");
    expect(screen.queryByTestId("new-items-pill")).toBeNull();
    expect(container.scrollTop).toBe(0); // pill click scrolls back to top
  });

  it("anchors the viewport when auto-flushing while slightly scrolled", async () => {
    state.items = [mk("a", "crypto"), mk("b", "macro")];
    const { rerender } = renderFeedInScroll();
    const container = document.getElementById("news-calendar-view")!;
    container.scrollTop = 20; // within AT_TOP_THRESHOLD -> auto-flush
    fireEvent.scroll(container);

    // stub the anchor card rect: topVisibleCard=40, anchorTop=40, post-insert=140
    const card = container.querySelector('[data-item-id]')!;
    const tops = [40, 40, 140];
    let calls = 0;
    (card as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ top: tops[Math.min(calls++, 2)], bottom: 200 } as DOMRect);

    const origRaf = globalThis.requestAnimationFrame;
    (globalThis as unknown as { requestAnimationFrame: (cb: () => void) => number }).requestAnimationFrame = (cb) => {
      cb();
      return 1;
    };
    try {
      state.pending = [mk("new", "crypto")];
      await act(async () => {
        rerender(scrollElement());
      });
    } finally {
      (globalThis as unknown as { requestAnimationFrame: (cb: () => void) => number }).requestAnimationFrame = origRaf;
    }

    expect(container.scrollTop).toBe(120); // 20 + (140 - 40) anchor compensation
  });

  it("shows the fallback load-earlier button and reveals more items", async () => {
    state.items = Array.from({ length: 150 }, (_, i) => mk(`id${i}`, "crypto"));
    renderFeed();

    expect(await screen.findByTestId("load-earlier-button")).toBeTruthy();
    expect(screen.queryByText("标题-id140")).toBeNull(); // beyond the 100-window

    fireEvent.click(screen.getByTestId("load-earlier-button"));
    expect(screen.getByText("标题-id140")).toBeTruthy();
  });

  it("shows all-loaded once everything is rendered", async () => {
    state.items = [mk("1", "crypto"), mk("2", "macro")];
    renderFeed();

    expect(await screen.findByTestId("all-loaded")).toBeTruthy();
    expect(screen.queryByTestId("load-earlier-button")).toBeNull();
  });
});
