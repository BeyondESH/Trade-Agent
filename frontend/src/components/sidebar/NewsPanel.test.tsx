// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewsPanel } from "./NewsPanel";

const mockFetch = vi.fn();

vi.mock("../../lib/newsfeed", () => ({
  NEWSFLASH_TYPES: [
    { key: "all", label: "All" },
    { key: "important", label: "Important" },
    { key: "ai", label: "AI" },
  ],
  fetchNewsflash: (...args: unknown[]) => mockFetch(...args),
}));

describe("NewsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders category tabs and fetches BlockBeats news", async () => {
    mockFetch.mockResolvedValue([
      {
        id: "1",
        title: "测试新闻标题",
        summary: "测试摘要",
        source: "BlockBeats",
        time: "2026-01-01T00:00:00.000Z",
        category: "Crypto",
        sentiment: "neutral",
        relatedSymbols: [],
      },
    ]);
    render(<NewsPanel theme="dark" />);
    expect(screen.getByText("市场头条")).toBeInTheDocument();
    expect(screen.getByText("Important")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("all");
    await waitFor(() => expect(screen.getByText("测试新闻标题")).toBeInTheDocument());
  });

  it("switches category on tab click", async () => {
    mockFetch.mockResolvedValue([]);
    render(<NewsPanel theme="dark" />);
    fireEvent.click(screen.getByText("Important"));
    expect(mockFetch).toHaveBeenCalledWith("important");
    await waitFor(() => expect(screen.getByText("暂无新闻")).toBeInTheDocument());
  });

  it("shows a visible error when the backend reports a config problem", async () => {
    mockFetch.mockRejectedValue(new Error("未配置 BB_API_KEY,请在 backend/.env 中设置"));
    render(<NewsPanel theme="dark" />);
    await waitFor(() => expect(screen.getByText(/未配置 BB_API_KEY/)).toBeInTheDocument());
  });
});
