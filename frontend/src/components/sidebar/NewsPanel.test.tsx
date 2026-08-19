// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewsPanel } from "./NewsPanel";
import { formatRelativeTime } from "../../lib/newsfeed";

const mockFetch = vi.fn();

vi.mock("../../lib/newsfeed", async () => {
  const actual = await vi.importActual<typeof import("../../lib/newsfeed")>("../../lib/newsfeed");
  return {
    ...actual,
    NEWSFLASH_TYPES: [
      { key: "all", label: "All" },
      { key: "important", label: "Important" },
      { key: "ai", label: "AI" },
    ],
    fetchNewsflash: (...args: unknown[]) => mockFetch(...args),
  };
});

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
    expect(mockFetch).toHaveBeenCalledWith("all");
    await waitFor(() => expect(screen.getByText("测试新闻标题")).toBeInTheDocument());
  });

  it("brings the active category to the front when collapsed", () => {
    mockFetch.mockResolvedValue([]);
    render(<NewsPanel theme="dark" />);
    // Active "all" first chip should be at the front of the collapsed row.
    const chips = screen.getAllByRole("button").filter((b) =>
      ["All", "Important", "AI"].includes(b.textContent ?? "")
    );
    expect(chips[0].textContent).toBe("All");
  });

  it("expands to reveal all categories and collapses back", () => {
    mockFetch.mockResolvedValue([]);
    render(<NewsPanel theme="dark" />);
    const toggle = screen.getByLabelText("Expand categories");
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Collapse categories")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Collapse categories"));
    expect(screen.getByLabelText("Expand categories")).toBeInTheDocument();
  });

  it("switches category on tab click", async () => {
    mockFetch.mockResolvedValue([]);
    render(<NewsPanel theme="dark" />);
    fireEvent.click(screen.getByText("Important"));
    expect(mockFetch).toHaveBeenCalledWith("important");
    await waitFor(() => expect(screen.getByText("暂无新闻")).toBeInTheDocument());
  });

  it("renders timestamps in relative/grouped format instead of raw ISO", async () => {
    const iso = "2026-01-01T00:00:00.000Z";
    mockFetch.mockResolvedValue([
      {
        id: "1",
        title: "测试新闻标题",
        summary: "测试摘要",
        source: "BlockBeats",
        time: iso,
        category: "Crypto",
        sentiment: "neutral",
        relatedSymbols: [],
      },
    ]);
    render(<NewsPanel theme="dark" />);
    await waitFor(() => expect(screen.getByText("测试新闻标题")).toBeInTheDocument());
    expect(screen.queryByText(iso)).not.toBeInTheDocument();
    expect(screen.getByText(formatRelativeTime(iso))).toBeInTheDocument();
  });

  it("shows a visible error when the backend reports a config problem", async () => {
    mockFetch.mockRejectedValue(new Error("未配置 BB_API_KEY,请在 backend/.env 中设置"));
    render(<NewsPanel theme="dark" />);
    await waitFor(() => expect(screen.getByText(/未配置 BB_API_KEY/)).toBeInTheDocument());
  });
});
