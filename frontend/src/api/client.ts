import type { GlobalNewsItem } from "../types/trading";
import type {
  AlertRecord,
  AnalyzeResponse,
  BackfillResponse,
  Candle,
  ChartConfig,
  ExecutionRun,
  Instrument,
  Level,
  ProposalMeta,
  ResearchStreamEvent,
  SeriesRef,
  StrategyProposal,
  StructureResponse,
  Ticker,
} from "./types";

const BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? body.error ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, String(detail));
  }
  return (await res.json()) as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return s ? `?${s}` : "";
}

// -- Research SSE consumer ------------------------------------------------
// Mirrors the established global-news EventSource pattern (see
// `lib/globalNews.ts`): the backend may tag frames either with a named SSE
// `event:` line or leave them on the default channel, so we listen on every
// known name plus `message` and dispatch by the JSON `type` field.

/** Named SSE channels the research stream endpoint may use. */
const RESEARCH_STREAM_EVENT_NAMES = ["node", "text", "done", "error"] as const;

export interface ResearchStreamHandlers {
  /** Called for every parsed stream frame. */
  onEvent: (event: ResearchStreamEvent) => void;
  /** Called once the underlying EventSource opens. */
  onOpen?: () => void;
  /**
   * Called on a transport error (the browser will auto-reconnect). Not called
   * after a terminal `done`/`error` frame has closed the stream.
   */
  onError?: () => void;
}

export interface ResearchStreamHandle {
  /** Close the EventSource and stop dispatching frames. */
  close: () => void;
}

/** URL of the research/execution SSE stream for a LangGraph `thread_id`. */
function researchStreamUrl(threadId: string): string {
  return `${BASE}/research/${encodeURIComponent(threadId)}/stream`;
}

export const api = {
  health: () => request<{ status: string; kill_switch: boolean; live_enabled: boolean }>("/health"),

  tickers: (category?: string) => request<{ tickers: Ticker[] }>(`/tickers${qs({ category })}`),

  instruments: (category?: string) =>
    request<{ instruments: Instrument[] }>(`/instruments${qs({ category })}`),

  candles: (s: SeriesRef, start?: number, end?: number, limit = 500) =>
    request<{ candles: Candle[]; count: number }>(`/candles${qs({ ...s, start, end, limit })}`),

  candlesRecent: (s: SeriesRef, limit = 200) =>
    request<{ candles: Candle[]; count: number }>(`/candles/recent${qs({ ...s, limit })}`),

  backfill: (s: SeriesRef, before: number) =>
    request<BackfillResponse>("/candles/backfill", {
      method: "POST",
      body: JSON.stringify({ ...s, before }),
    }),

  books: (s: { category: string; symbol: string }) =>
    request<{
      symbol: string;
      category: string;
      asks: [number, number][];
      bids: [number, number][];
      seq: number | null;
    }>(`/books/${s.category}/${s.symbol}`),

  trades: (s: { category: string; symbol: string }, limit = 50) =>
    request<{
      symbol: string;
      category: string;
      trades: Record<string, unknown>[];
    }>(`/trades/${s.category}/${s.symbol}${qs({ limit })}`),

  funding: (category?: string) =>
    request<{ funding: Record<string, unknown>[] }>(`/funding${qs({ category })}`),

  markPrice: (category?: string) =>
    request<{ mark_prices: Record<string, unknown>[] }>(`/mark-price${qs({ category })}`),

  analyze: (s: SeriesRef, top = 8) => request<AnalyzeResponse>(`/analyze${qs({ ...s, top })}`),

  levels: (s: SeriesRef, top = 8) => request<{ levels: Level[] }>(`/levels${qs({ ...s, top })}`),

  structure: (s: SeriesRef) => request<StructureResponse>(`/structure${qs({ ...s })}`),

  chartConfig: (s: SeriesRef) => request<ChartConfig>(`/chart-config${qs({ ...s })}`),

  saveChartConfig: (s: SeriesRef, state: ChartConfig) =>
    request<ChartConfig>("/chart-config", {
      method: "PUT",
      body: JSON.stringify({ ...s, state }),
    }),

  // /alerts — server-side persistence (cross-device); the frontend mirrors
  // writes and falls back to localStorage when the backend is unreachable.
  alerts: () => request<{ alerts: AlertRecord[] }>("/alerts"),
  saveAlert: (alert: AlertRecord) =>
    request<{ ok: boolean; alert: AlertRecord }>("/alerts", {
      method: "POST",
      body: JSON.stringify(alert),
    }),
  updateAlert: (id: string, patch: Partial<Omit<AlertRecord, "id" | "createdAt">>) =>
    request<{ ok: boolean; alert: AlertRecord }>(`/alerts/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  deleteAlert: (id: string) =>
    request<{ ok: boolean }>(`/alerts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // BlockBeats news/data (proxied server-side; key never leaves the backend).
  blockbeatsNews: (type: string, page = 1, size = 20, lang = "cn") =>
    request<{
      status: number;
      page: number;
      data: Array<{
        id: number;
        title: string;
        content: string;
        pic?: string;
        link?: string;
        url?: string;
        create_time: string | number;
      }>;
    }>(`/blockbeats/newsflash/${encodeURIComponent(type)}${qs({ page, size, lang })}`),

  blockbeatsData: (endpoint: string, opts?: { network?: string; type?: string }) =>
    request<{ status: number; data: unknown }>(
      `/blockbeats/data/${encodeURIComponent(endpoint)}${qs({ network: opts?.network, type: opts?.type })}`,
    ),

  // Global news pipeline (AKShare-based; free, no API key).
  newsCategories: () => request<{ categories: string[] }>("/news/categories"),
  newsContext: (hours?: number, category?: string) =>
    request<{ items: GlobalNewsItem[]; generated_at: string }>(
      `/news/context${qs({ hours, category })}`,
    ),
  newsHistory: (offset = 0, limit = 100, category?: string) =>
    request<{ items: GlobalNewsItem[]; total: number }>(
      `/news/history${qs({ offset, limit, category })}`,
    ),

  // -- Research / execution (read-only projection; no mutation endpoints) --
  researchProposals: (opts?: { symbol?: string; limit?: number }) =>
    request<{ proposals: ProposalMeta[] }>(
      `/research/proposals${qs({ symbol: opts?.symbol, limit: opts?.limit })}`,
    ),

  researchProposal: (id: string) =>
    request<StrategyProposal>(`/research/proposals/${encodeURIComponent(id)}`),

  executionRun: (runId: string) =>
    request<ExecutionRun>(`/executions/${encodeURIComponent(runId)}`),

  /**
   * Consume `GET /research/{thread_id}/stream` (text/event-stream). Returns a
   * handle whose `close()` tears the connection down; parsing tolerates the
   * event name living either in the SSE `event:` field or the JSON `type`.
   */
  openResearchStream: (
    threadId: string,
    handlers: ResearchStreamHandlers,
  ): ResearchStreamHandle => {
    const es = new EventSource(researchStreamUrl(threadId));
    let done = false;

    const dispatch = (e: Event) => {
      if (done) return;
      let event: ResearchStreamEvent;
      try {
        event = JSON.parse((e as MessageEvent<string>).data) as ResearchStreamEvent;
      } catch {
        return; // ignore malformed frames
      }
      if (!event || typeof event.type !== "string") return;
      handlers.onEvent(event);
      // Terminal frames end the run; close so the browser does not reconnect.
      if (event.type === "done" || event.type === "error") {
        done = true;
        es.close();
      }
    };

    for (const name of RESEARCH_STREAM_EVENT_NAMES) es.addEventListener(name, dispatch);
    es.addEventListener("message", dispatch);
    es.onopen = () => {
      if (!done) handlers.onOpen?.();
    };
    es.onerror = () => {
      if (!done) handlers.onError?.();
    };

    return {
      close: () => {
        done = true;
        es.close();
      },
    };
  },
};
