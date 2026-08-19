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

/** Fetch a BlockBeats newsflash category (first page only; see fetchNewsflashPage). */
export async function fetchNewsflash(type: NewsflashType): Promise<NewsItem[]> {
  return (await fetchNewsflashPage(type, 1, 20)).items;
}

export interface NewsflashPage {
  items: NewsItem[];
  page: number;
  hasMore: boolean;
}

/** Fetch one page of a newsflash category; hasMore is a full-page approximation. */
export async function fetchNewsflashPage(
  type: NewsflashType,
  page: number = 1,
  size: number = 20,
): Promise<NewsflashPage> {
  try {
    const res = await api.blockbeatsNews(type, page, size, "cn");
    const rows = res.data ?? [];
    return {
      items: rows.map(toNewsItem),
      page,
      hasMore: rows.length >= size,
    };
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

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Format an ISO timestamp as a compact "MM-DD HH:mm" (UTC) for the display layer. */
function formatClock(iso: string): string {
  const d = new Date(iso);
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  return `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${hh}:${mm}`;
}

/** Day key for grouping (UTC date string) used by both grouping and labels. */
function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** Display-layer relative time for news. Does NOT change NewsItem.time's contract. */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return iso;
  const diff = now - d;
  const minute = 60_000;
  const hour = 60 * minute;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < 24 * hour) return `${Math.floor(diff / hour)} 小时前`;
  return formatClock(iso);
}

/** Date-group label for news: 今天 / 昨天 / MM-DD. */
export function formatDateGroup(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  const todayKey = utcDayKey(new Date(now));
  const dayKey = utcDayKey(d);
  if (dayKey === todayKey) return "今天";
  const yesterday = new Date(now - 24 * 3_600_000);
  if (dayKey === utcDayKey(yesterday)) return "昨天";
  return `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** A news group keyed by its display label, preserving insertion order. */
export interface NewsGroup {
  label: string;
  items: NewsItem[];
}

/** Group news by date (today / yesterday / MM-DD), preserving original order within a group. */
export function groupNewsByDate(items: NewsItem[], now: number = Date.now()): NewsGroup[] {
  const groups = new Map<string, NewsGroup>();
  for (const item of items) {
    const label = formatDateGroup(item.time, now);
    const existing = groups.get(label);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(label, { label, items: [item] });
    }
  }
  return [...groups.values()];
}
