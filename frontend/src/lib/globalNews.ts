import { useEffect, useReducer, useState } from "react";
import type { GlobalNewsItem } from "../types/trading";
import { api } from "../api/client";
import { formatRelativeTime } from "./newsfeed";

const STREAM_URL = "/api/news/stream";

/** Number of newest cards mounted at once (windowed rendering). */
export const NEWS_WINDOW_SIZE = 100;
/** Chunk size for revealing older items (scroll-to-load-more). */
export const REVEAL_CHUNK = 100;
/** Page size for `/news/history` fetches beyond the client buffer. */
const HISTORY_LIMIT = 100;

export type NewsStreamState = "connecting" | "open" | "closed";

export interface NewsSourceHealth {
  last_ts: number | null;
  last_error: string | null;
  failures: number;
}

export interface SnapshotPayload {
  items: GlobalNewsItem[];
  sources: Record<string, NewsSourceHealth>;
  total?: number;
}

/** Fetch the ordered topic categories (chips) from the backend. */
export async function fetchNewsCategories(): Promise<string[]> {
  const res = await api.newsCategories();
  return res.categories;
}

/** All sources unhealthy (every source failed and none ever succeeded). */
export function allSourcesUnavailable(sources: Record<string, NewsSourceHealth>): boolean {
  const entries = Object.values(sources);
  if (entries.length === 0) return false;
  return entries.every((s) => !!s.last_error) && entries.every((s) => s.last_ts == null);
}

/** Format an epoch-seconds timestamp as relative/clock text for the feed. */
export function formatNewsTime(ts: number, now: number = Date.now()): string {
  return formatRelativeTime(new Date(ts * 1000).toISOString(), now);
}

/**
 * EventSource client for the global-news SSE stream.
 *
 * Keeps items **newest-first**. The backend sends `snapshot` newest-first and
 * capped at `SNAPSHOT_MAX_ITEMS`; live `item` events accumulate in a `pending`
 * bucket until the UI flushes them (so a user reading history isn't disturbed).
 * On every (re)connect the backend replays a `snapshot`, so we dedup by `id`
 * and rebuild the authoritative newest-first order from it.
 */
export class GlobalNewsClient {
  private es: EventSource | null = null;
  private seen = new Set<string>();
  private _items: GlobalNewsItem[] = []; // newest-first
  private _pending: GlobalNewsItem[] = []; // newest-first, awaiting flush
  private _state: NewsStreamState = "closed";
  private _sources: Record<string, NewsSourceHealth> = {};
  private _hasMore = true;
  private _loadingMore = false;
  private listeners = new Set<() => void>();
  private streamUrl: string;

  constructor(streamUrl: string = STREAM_URL) {
    this.streamUrl = streamUrl;
  }

  get items(): readonly GlobalNewsItem[] {
    return this._items;
  }

  get pendingCount(): number {
    return this._pending.length;
  }

  get state(): NewsStreamState {
    return this._state;
  }

  get sources(): Record<string, NewsSourceHealth> {
    return this._sources;
  }

  get hasMore(): boolean {
    return this._hasMore;
  }

  connect(): void {
    if (this.es) return;
    this.setState("connecting");
    const es = new EventSource(this.streamUrl);
    this.es = es;
    es.addEventListener("snapshot", (e) => this.handleSnapshot(e as MessageEvent<string>));
    es.addEventListener("item", (e) => this.handleItem(e as MessageEvent<string>));
    es.onopen = () => this.setState("open");
    // EventSource auto-reconnects; reflect the transient drop in state.
    es.onerror = () => this.setState("closed");
  }

  close(): void {
    if (!this.es) return;
    this.es.close();
    this.es = null;
    this.setState("closed");
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Move pending items into the rendered list (newest-first prepend). */
  flushPending(): GlobalNewsItem[] {
    if (this._pending.length === 0) return [];
    const out = this._pending;
    this._pending = [];
    this._items = [...out, ...this._items];
    this.emit();
    return out;
  }

  /** Page older history from `/news/history` when the client buffer is exhausted. */
  async loadMore(category?: string): Promise<void> {
    if (this._loadingMore || !this._hasMore) return;
    this._loadingMore = true;
    try {
      const offset = this._items.length + this._pending.length;
      const res = await api.newsHistory(offset, HISTORY_LIMIT, category);
      for (const item of res.items) {
        if (!item || !item.id || this.seen.has(item.id)) continue;
        this.seen.add(item.id);
        this._items.push(item); // history items are older -> append keeps newest-first
      }
      this._hasMore = this._items.length < res.total;
      this.emit();
    } finally {
      this._loadingMore = false;
    }
  }

  private handleSnapshot(e: MessageEvent<string>) {
    try {
      const data = JSON.parse(e.data) as SnapshotPayload;
      if (data.sources) this._sources = data.sources;
      const snap = data.items ?? [];
      for (const item of snap) this.seen.add(item.id);
      const snapIds = new Set(snap.map((i) => i.id));
      // keep items the snapshot no longer carries (e.g. fetched history)
      const stale = this._items.filter((i) => !snapIds.has(i.id));
      this._pending = [];
      this._items = [...snap, ...stale];
      if (typeof data.total === "number") {
        this._hasMore = this._items.length < data.total;
      }
    } catch {
      /* ignore malformed frames */
    }
    this.emit();
  }

  private handleItem(e: MessageEvent<string>) {
    try {
      const item = JSON.parse(e.data) as GlobalNewsItem;
      if (item && item.id && !this.seen.has(item.id)) {
        this.seen.add(item.id);
        this._pending.unshift(item); // newest first
      }
    } catch {
      /* ignore malformed frames */
    }
    this.emit();
  }

  private setState(state: NewsStreamState) {
    if (this._state === state) return;
    this._state = state;
    this.emit();
  }

  private emit() {
    for (const cb of this.listeners) cb();
  }
}

/** React hook over a single stream client instance (lifetime == component). */
export function useGlobalNewsStream(): {
  items: readonly GlobalNewsItem[];
  state: NewsStreamState;
  sources: Record<string, NewsSourceHealth>;
  pendingCount: number;
  flushPending: () => GlobalNewsItem[];
  hasMore: boolean;
  loadMore: (category?: string) => Promise<void>;
} {
  const [client] = useState(() => new GlobalNewsClient());
  const [, force] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    client.connect();
    const unsubscribe = client.subscribe(() => force());
    return () => {
      unsubscribe();
      client.close();
    };
  }, [client]);

  return {
    items: client.items,
    state: client.state,
    sources: client.sources,
    pendingCount: client.pendingCount,
    flushPending: client.flushPending,
    hasMore: client.hasMore,
    loadMore: client.loadMore,
  };
}
