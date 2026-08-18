import type { NewsItem } from "../types/trading";
import { api } from "../api/client";

export const NEWSFLASH_TYPES = [
  { key: "all", label: "All" },
  { key: "24h", label: "24H" },
  { key: "important", label: "Important" },
  { key: "original", label: "Original" },
  { key: "first", label: "First" },
  { key: "onchain", label: "Onchain" },
  { key: "financing", label: "Financing" },
  { key: "prediction", label: "Prediction" },
  { key: "ai", label: "AI" },
  { key: "stock", label: "Stock" },
] as const;

export type NewsflashType = (typeof NEWSFLASH_TYPES)[number]["key"];

/** Strip HTML tags from BlockBeats content into plain text (DOM-free). */
export function htmlToText(html: string): string {
  return String(html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse BlockBeats create_time: "Y-m-d H:i:s" or epoch-seconds (UTC). */
export function parseBlockbeatsTime(raw: string | number): string {
  if (typeof raw === "number") {
    return new Date(raw * 1000).toISOString();
  }
  if (/^\d{10,13}$/.test(raw)) {
    return new Date(Number(raw) * 1000).toISOString();
  }
  const s = String(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (m) {
    const [, y, mo, d, h, mi, se] = m;
    // Treat as UTC to avoid local-timezone drift in serialized timestamps.
    return new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se)),
    ).toISOString();
  }
  return s;
}

/** Map a BlockBeats row to the template NewsItem shape. */
export function toNewsItem(row: {
  id: number;
  title: string;
  content: string;
  create_time: string | number;
}): NewsItem {
  const source = "BlockBeats";
  const summary = htmlToText(row.content ?? "");
  const time = parseBlockbeatsTime(row.create_time);
  return {
    id: String(row.id),
    title: row.title ?? "",
    source,
    time,
    category: "Crypto",
    sentiment: "neutral",
    summary,
    relatedSymbols: [],
  };
}

/** Fetch a BlockBeats newsflash category. */
export async function fetchNewsflash(type: NewsflashType): Promise<NewsItem[]> {
  try {
    const res = await api.blockbeatsNews(type, 1, 20, "cn");
    return (res.data ?? []).map(toNewsItem);
  } catch (err) {
    throw new Error(isConfigError(err) ? "未配置 BB_API_KEY,请在 backend/.env 中设置" : "新闻接口暂不可用");
  }
}

/** Distinguish a missing-API-key 400 from a transient upstream failure. */
export function isConfigError(err: unknown): boolean {
  const detail = (err as { detail?: unknown })?.detail;
  if (typeof detail === "string" && detail.includes("BB_API_KEY")) return true;
  const message = (err as { message?: unknown })?.message;
  return typeof message === "string" && message.includes("BB_API_KEY");
}
