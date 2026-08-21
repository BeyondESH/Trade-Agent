// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NewsCalendarView } from "./NewsCalendarView";
import { fetchNewsflashPage } from "../../lib/newsfeed";
import type { NewsItem } from "../../types/trading";

vi.mock("../../lib/newsfeed", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../lib/newsfeed")>();
  return { ...mod, fetchNewsflashPage: vi.fn() };
});

vi.mock("./GlobalNewsFeed", () => ({
  GlobalNewsFeed: () => <div data-testid="global-news-feed">Global Feed</div>,
}));

const mockedFetch = vi.mocked(fetchNewsflashPage);

function mkItems(start: number, size: number): NewsItem[] {
  return Array.from({ length: size }, (_, i) => ({
    id: String(start + i),
    title: `news-${start + i}`,
    source: "BlockBeats",
    time: "2026-01-29T14:32:37.000Z",
    category: "Crypto" as const,
    sentiment: "neutral" as const,
    summary: "summary",
    relatedSymbols: [],
  }));
}

function renderView() {
  return render(<NewsCalendarView onOpenChartWithTicker={() => {}} theme="dark" />);
}

beforeEach(() => {
  mockedFetch.mockReset();
});

describe("NewsCalendarView infinite scroll", () => {
  it("loads the first page on mount", async () => {
    mockedFetch.mockResolvedValue({ items: mkItems(0, 20), page: 1, hasMore: true });
    renderView();
    expect(await screen.findByText("news-0")).toBeTruthy();
    expect(mockedFetch).toHaveBeenCalledWith("all", 1, 20);
  });

  it("appends the next page when scrolled to the bottom", async () => {
    mockedFetch
      .mockResolvedValueOnce({ items: mkItems(0, 20), page: 1, hasMore: true })
      .mockResolvedValueOnce({ items: mkItems(20, 20), page: 2, hasMore: false });
    renderView();
    expect(await screen.findByText("news-0")).toBeTruthy();

    const container = document.getElementById("news-calendar-view")!;
    act(() => {
      fireEvent.scroll(container);
    });
    expect(await screen.findByText("news-20")).toBeTruthy();
    expect(mockedFetch).toHaveBeenLastCalledWith("all", 2, 20);
  });

  it("deduplicates overlapping ids across pages", async () => {
    const page1 = mkItems(0, 2);
    const page2 = [page1[0], mkItems(2, 1)[0]];
    mockedFetch
      .mockResolvedValueOnce({ items: page1, page: 1, hasMore: true })
      .mockResolvedValueOnce({ items: page2, page: 2, hasMore: false });
    renderView();
    expect(await screen.findByText("news-0")).toBeTruthy();

    const container = document.getElementById("news-calendar-view")!;
    act(() => {
      fireEvent.scroll(container);
    });
    expect(await screen.findByText("news-2")).toBeTruthy();
    expect(screen.getAllByText("news-0")).toHaveLength(1);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it("resets the list and page when switching category", async () => {
    mockedFetch.mockResolvedValue({ items: mkItems(0, 20), page: 1, hasMore: true });
    renderView();
    expect(await screen.findByText("news-0")).toBeTruthy();

    mockedFetch.mockClear();
    mockedFetch.mockResolvedValue({ items: mkItems(100, 20), page: 1, hasMore: true });
    fireEvent.click(screen.getByText("24H"));
    expect(await screen.findByText("news-100")).toBeTruthy();
    expect(mockedFetch).toHaveBeenCalledWith("24h", 1, 20);
    expect(screen.queryByText("news-0")).toBeNull();
  });

  it("stops loading when hasMore is false", async () => {
    mockedFetch
      .mockResolvedValueOnce({ items: mkItems(0, 20), page: 1, hasMore: false })
      .mockResolvedValueOnce({ items: mkItems(20, 20), page: 2, hasMore: false });
    renderView();
    expect(await screen.findByText("news-0")).toBeTruthy();

    const container = document.getElementById("news-calendar-view")!;
    act(() => {
      fireEvent.scroll(container);
    });
    expect(screen.queryByText("news-20")).toBeNull();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("switches to the global news feed segment and back", async () => {
    mockedFetch.mockResolvedValue({ items: mkItems(0, 20), page: 1, hasMore: true });
    renderView();
    expect(await screen.findByText("news-0")).toBeTruthy();

    fireEvent.click(screen.getByText("全域快讯"));
    expect(screen.getByTestId("global-news-feed")).toBeTruthy();
    expect(screen.queryByText("news-0")).toBeNull();

    // Back to Market News Wire: the BlockBeats flow is untouched.
    fireEvent.click(screen.getByText("市场快讯"));
    expect(await screen.findByText("news-0")).toBeTruthy();
  });
});
