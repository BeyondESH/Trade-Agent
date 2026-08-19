import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  htmlToText,
  parseBlockbeatsTime,
  toNewsItem,
  NEWSFLASH_TYPES,
  fetchNewsflash,
  formatRelativeTime,
  formatDateGroup,
  groupNewsByDate,
} from "./newsfeed";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: { blockbeatsNews: vi.fn() },
}));

describe("newsfeed utils", () => {
  it("strips HTML tags from BlockBeats content", () => {
    expect(htmlToText("<p>BlockBeats 消息，<a href='x'>Deribit</a> 披露。</p>")).toBe(
      "BlockBeats 消息，Deribit 披露。",
    );
  });

  it("parses Y-m-d H:i:s create_time", () => {
    expect(parseBlockbeatsTime("2026-01-29 14:32:37")).toBe("2026-01-29T14:32:37.000Z");
  });

  it("parses epoch-seconds create_time", () => {
    expect(parseBlockbeatsTime(1769677313)).toBe(new Date(1769677313 * 1000).toISOString());
  });

  it("parses epoch-seconds as string", () => {
    expect(parseBlockbeatsTime("1769677313")).toBe(new Date(1769677313 * 1000).toISOString());
  });

  it("maps a BlockBeats row to a NewsItem", () => {
    const n = toNewsItem({
      id: 330276,
      title: "明日超95亿美元加密期权到期",
      content: "<p>Deribit 披露。</p>",
      create_time: "2026-01-29 14:32:37",
    });
    expect(n.id).toBe("330276");
    expect(n.title).toBe("明日超95亿美元加密期权到期");
    expect(n.summary).toBe("Deribit 披露。");
    expect(n.source).toBe("BlockBeats");
  });

  it("exposes all 10 newsflash types", () => {
    expect(NEWSFLASH_TYPES.map((t) => t.key)).toEqual([
      "all",
      "24h",
      "important",
      "original",
      "first",
      "onchain",
      "financing",
      "prediction",
      "ai",
      "stock",
    ]);
  });
});

describe("newsfeed time formatting", () => {
  const now = Date.UTC(2026, 0, 29, 15, 0, 0); // 2026-01-29 15:00:00 UTC

  it("formats fresh news as 刚刚", () => {
    expect(formatRelativeTime("2026-01-29T14:59:40.000Z", now)).toBe("刚刚");
  });

  it("formats sub-hour news as N 分钟前", () => {
    expect(formatRelativeTime("2026-01-29T14:50:00.000Z", now)).toBe("10 分钟前");
  });

  it("treats exactly 60 minutes as 1 小时前", () => {
    expect(formatRelativeTime("2026-01-29T14:00:00.000Z", now)).toBe("1 小时前");
  });

  it("falls back to MM-DD HH:mm beyond 24h", () => {
    expect(formatRelativeTime("2026-01-28T15:00:00.000Z", now)).toBe("01-28 15:00");
  });

  it("falls back to the raw input when the timestamp is invalid", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("not-a-date");
  });

  it("labels today, yesterday and older dates", () => {
    expect(formatDateGroup("2026-01-29T10:00:00.000Z", now)).toBe("今天");
    expect(formatDateGroup("2026-01-28T10:00:00.000Z", now)).toBe("昨天");
    expect(formatDateGroup("2026-01-01T10:00:00.000Z", now)).toBe("01-01");
  });

  it("handles cross-year yesterday (previous year on Jan 1)", () => {
    const nye = Date.UTC(2026, 0, 1, 10, 0, 0);
    expect(formatDateGroup("2025-12-31T12:00:00.000Z", nye)).toBe("昨天");
  });

  it("groups news by date preserving order", () => {
    const mk = (id: string, time: string) => ({
      id,
      title: `t${id}`,
      source: "BlockBeats",
      time,
      category: "Crypto" as const,
      sentiment: "neutral" as const,
      summary: "",
      relatedSymbols: [],
    });
    const groups = groupNewsByDate(
      [
        mk("a", "2026-01-28T09:00:00.000Z"),
        mk("b", "2026-01-29T11:00:00.000Z"),
        mk("c", "2026-01-29T12:00:00.000Z"),
        mk("d", "2026-01-01T00:00:00.000Z"),
      ],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual(["昨天", "今天", "01-01"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["b", "c"]);
  });
});

describe("fetchNewsflash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the right backend endpoint and maps rows", async () => {
    vi.mocked(api.blockbeatsNews).mockResolvedValue({
      status: 0,
      page: 1,
      data: [
        {
          id: 1,
          title: "t",
          content: "<p>c</p>",
          create_time: "2026-01-29 14:32:37",
        },
      ],
    });
    const rows = await fetchNewsflash("financing");
    expect(api.blockbeatsNews).toHaveBeenCalledWith("financing", 1, 20, "cn");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("1");
  });

  it("throws with a config message on missing BB_API_KEY", async () => {
    vi.mocked(api.blockbeatsNews).mockRejectedValue(new Error("BB_API_KEY is not set"));
    await expect(fetchNewsflash("ai")).rejects.toThrow("未配置 BB_API_KEY");
  });

  it("throws a generic message on other upstream errors", async () => {
    vi.mocked(api.blockbeatsNews).mockRejectedValue(new Error("upstream"));
    await expect(fetchNewsflash("ai")).rejects.toThrow("新闻接口暂不可用");
  });
});
