import { describe, expect, it, vi, beforeEach } from "vitest";
import { htmlToText, parseBlockbeatsTime, toNewsItem, NEWSFLASH_TYPES, fetchNewsflash } from "./newsfeed";
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

  it("returns empty list on upstream error", async () => {
    vi.mocked(api.blockbeatsNews).mockRejectedValue(new Error("upstream"));
    const rows = await fetchNewsflash("ai");
    expect(rows).toEqual([]);
  });
});
