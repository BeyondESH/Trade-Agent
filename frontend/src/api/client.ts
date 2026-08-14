import type {
  AgentDecision,
  AnalyzeResponse,
  AppConfig,
  Candle,
  ChartConfig,
  Level,
  Portfolio,
  SeriesRef,
  StructureResponse,
} from "./types";

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

  candles: (s: SeriesRef, start?: number, end?: number, limit = 500) =>
    request<{ candles: Candle[]; count: number }>(
      `/candles${qs({ ...s, start, end, limit })}`,
    ),

  candlesRecent: (s: SeriesRef, limit = 200) =>
    request<{ candles: Candle[]; count: number }>(
      `/candles/recent${qs({ ...s, limit })}`,
    ),

  analyze: (s: SeriesRef, top = 8) =>
    request<AnalyzeResponse>(`/analyze${qs({ ...s, top })}`),

  levels: (s: SeriesRef, top = 8) =>
    request<{ levels: Level[] }>(`/levels${qs({ ...s, top })}`),

  structure: (s: SeriesRef) =>
    request<StructureResponse>(`/structure${qs({ ...s })}`),

  backtest: (s: SeriesRef) =>
    request<{ job_id: string }>("/backtest", {
      method: "POST",
      body: JSON.stringify(s),
    }),

  job: (id: string) => request<Record<string, unknown>>(`/jobs/${id}`),

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
};
