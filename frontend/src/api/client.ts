import type {
  AgentDecision,
  AlertRecord,
  AnalyzeResponse,
  AppConfig,
  BackfillResponse,
  BacktestHistoryDetail,
  BacktestHistoryMeta,
  BacktestJobResult,
  BacktestParams,
  Candle,
  ChartConfig,
  DlFeaturesResponse,
  FactorDef,
  Instrument,
  Level,
  Portfolio,
  SeriesRef,
  StructureResponse,
  SweepResult,
  Ticker,
  WalkForwardResult,
} from "./types";
import type { GlobalNewsItem } from "../types/trading";

const BASE = "/api";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
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

export const api = {
  health: () => request<{ status: string }>("/health"),

  tickers: (category?: string) =>
    request<{ tickers: Ticker[] }>(`/tickers${qs({ category })}`),

  instruments: (category?: string) =>
    request<{ instruments: Instrument[] }>(`/instruments${qs({ category })}`),

  candles: (s: SeriesRef, start?: number, end?: number, limit = 500) =>
    request<{ candles: Candle[]; count: number }>(
      `/candles${qs({ ...s, start, end, limit })}`,
    ),

  candlesRecent: (s: SeriesRef, limit = 200) =>
    request<{ candles: Candle[]; count: number }>(
      `/candles/recent${qs({ ...s, limit })}`,
    ),

  backfill: (s: SeriesRef, before: number) =>
    request<BackfillResponse>("/candles/backfill", {
      method: "POST",
      body: JSON.stringify({ ...s, before }),
    }),

  books: (s: { category: string; symbol: string }) =>
    request<{ symbol: string; category: string; asks: [number, number][]; bids: [number, number][]; seq: number | null }>(
      `/books/${s.category}/${s.symbol}`,
    ),

  trades: (s: { category: string; symbol: string }, limit = 50) =>
    request<{ symbol: string; category: string; trades: Record<string, unknown>[] }>(
      `/trades/${s.category}/${s.symbol}${qs({ limit })}`,
    ),

  funding: (category?: string) =>
    request<{ funding: Record<string, unknown>[] }>(`/funding${qs({ category })}`),

  markPrice: (category?: string) =>
    request<{ mark_prices: Record<string, unknown>[] }>(`/mark-price${qs({ category })}`),

  analyze: (s: SeriesRef, top = 8) =>
    request<AnalyzeResponse>(`/analyze${qs({ ...s, top })}`),

  levels: (s: SeriesRef, top = 8) =>
    request<{ levels: Level[] }>(`/levels${qs({ ...s, top })}`),

  structure: (s: SeriesRef) =>
    request<StructureResponse>(`/structure${qs({ ...s })}`),

  backtest: (
    s: SeriesRef,
    opts?: { factors?: FactorDef[]; params?: BacktestParams; start?: number; end?: number },
  ) =>
    request<{ job_id: string }>("/backtest", {
      method: "POST",
      body: JSON.stringify({ ...s, ...opts }),
    }),

  job: (id: string) =>
    request<{ status: "running" | "done" | "error"; result?: BacktestJobResult; error?: string }>(`/jobs/${id}`),

  backtestHistory: () => request<{ runs: BacktestHistoryMeta[] }>("/backtest/history"),
  backtestHistoryDetail: (id: string) =>
    request<BacktestHistoryDetail>(`/backtest/history/${encodeURIComponent(id)}`),
  backtestHistoryDelete: (id: string) =>
    request<{ deleted: boolean }>(`/backtest/history/${encodeURIComponent(id)}`, { method: "DELETE" }),

  dlFeatures: (s: SeriesRef, factors?: FactorDef[], start?: number, end?: number) =>
    request<DlFeaturesResponse>("/dl/features", {
      method: "POST",
      body: JSON.stringify({ ...s, factors, start, end }),
    }),

  sweep: (
    s: SeriesRef,
    opts: {
      thresholds: number[];
      factors?: FactorDef[];
      params?: BacktestParams;
      start?: number;
      end?: number;
      fees?: number[];
      slippages?: number[];
    },
  ) =>
    request<SweepResult>("/backtest/sweep", {
      method: "POST",
      body: JSON.stringify({ ...s, ...opts }),
    }),

  walkforward: (
    s: SeriesRef,
    opts: {
      n_splits?: number;
      factors?: FactorDef[];
      params?: BacktestParams;
      start?: number;
      end?: number;
    },
  ) =>
    request<WalkForwardResult>("/backtest/walkforward", {
      method: "POST",
      body: JSON.stringify({ ...s, ...opts }),
    }),

  agentDecide: (s: SeriesRef) =>
    request<AgentDecision>("/agent/decide", {
      method: "POST",
      body: JSON.stringify(s),
    }),

  agentCycle: (s: SeriesRef) =>
    request<Record<string, unknown>>("/agent/cycle", {
      method: "POST",
      body: JSON.stringify(s),
    }),

  getConfig: () => request<AppConfig>("/config"),

  putConfig: (cfg: AppConfig) =>
    request<AppConfig>("/config", { method: "PUT", body: JSON.stringify(cfg) }),

  portfolio: () => request<Portfolio>("/portfolio"),

  journal: () => request<{ trades: Record<string, unknown>[] }>("/journal"),

  control: (body: { kill_switch?: boolean; live_enabled?: boolean }) =>
    request<{ kill_switch: boolean; live_enabled: boolean }>("/control", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  order: (body: {
    category: string;
    symbol: string;
    side: string;
    leverage: number;
    price: number;
  }) =>
    request<{ token: string; preview: Record<string, number> }>("/order", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  orderConfirm: (token: string) =>
    request<{ approved: boolean; filled: boolean; reason: string; live: boolean }>(
      "/order/confirm",
      { method: "POST", body: JSON.stringify({ token }) },
    ),

  chartConfig: (s: SeriesRef) =>
    request<ChartConfig>(`/chart-config${qs({ ...s })}`),

  saveChartConfig: (s: SeriesRef, state: ChartConfig) =>
    request<ChartConfig>("/chart-config", {
      method: "PUT",
      body: JSON.stringify({ ...s, state }),
    }),

  // /alerts — server-side persistence (cross-device); the frontend mirrors
  // writes and falls back to localStorage when the backend is unreachable.
  alerts: () => request<{ alerts: AlertRecord[] }>("/alerts"),
  saveAlert: (alert: AlertRecord) =>
    request<{ ok: boolean; alert: AlertRecord }>("/alerts", { method: "POST", body: JSON.stringify(alert) }),
  updateAlert: (id: string, patch: Partial<Omit<AlertRecord, "id" | "createdAt">>) =>
    request<{ ok: boolean; alert: AlertRecord }>(`/alerts/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  deleteAlert: (id: string) =>
    request<{ ok: boolean }>(`/alerts/${encodeURIComponent(id)}`, { method: "DELETE" }),

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
};
