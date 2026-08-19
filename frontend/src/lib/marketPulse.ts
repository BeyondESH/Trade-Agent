import { api } from "../api/client";

/** The 11 BlockBeats data endpoints, labeled for the Data Window "Market Pulse". */
export const MARKET_PULSE_ENDPOINTS = [
  { endpoint: "btc_etf", label: "BTC Spot ETF Net Flow" },
  { endpoint: "daily_tx", label: "Daily Trading Volume" },
  { endpoint: "ibit_fbtc", label: "iBit / fBTC Net Flow" },
  { endpoint: "stablecoin_marketcap", label: "Stablecoin Market Cap" },
  { endpoint: "compliant_total", label: "CEX Total Assets" },
  { endpoint: "us10y", label: "US 10Y Treasury Yield" },
  { endpoint: "dxy", label: "US Dollar Index (DXY)" },
  { endpoint: "bitfinex_long", label: "Bitfinex Leveraged Long" },
  { endpoint: "contract", label: "Futures Platforms" },
  { endpoint: "bottom_top_indicator", label: "Bottom/Top Indicator" },
] as const;

export type MarketPulseEntry = {
  endpoint: string;
  label: string;
  value: string;
  trend: number | null;
  raw: unknown;
};

/** Flatten an unknown BlockBeats payload into a compact display string. */
export function flattenValue(v: unknown, depth = 0): string {
  if (v === null || v === undefined) return "N/A";
  if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
  if (typeof v === "boolean") return String(v);
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return "N/A";
    return t;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "N/A";
    if (v.length === 1) return flattenValue(v[0], depth + 1);
    return `${v.length} items`;
  }
  if (typeof v === "object") {
    if (depth > 1) return "…";
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return "N/A";
    return entries
      .map(([k, val]) => `${k}: ${flattenValue(val, depth + 1)}`)
      .join("  ");
  }
  return String(v);
}

/** Best-effort numeric trend from a payload (first numeric leaf that looks like a rate/percent). */
export function extractTrend(raw: unknown): number | null {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  if (Array.isArray(raw)) {
    for (const it of raw) {
      const t = extractTrend(it);
      if (t !== null) return t;
    }
    return null;
  }
  if (typeof raw === "object" && raw !== null) {
    for (const v of Object.values(raw as Record<string, unknown>)) {
      const t = extractTrend(v);
      if (t !== null) return t;
    }
  }
  return null;
}

/** Extract a numeric time series (for the DXY 1M sparkline) from a payload. */
export function extractSeries(raw: unknown): number[] {
  const out: number[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const it of v) walk(it);
      return;
    }
    if (typeof v === "object" && v !== null) {
      const rec = v as Record<string, unknown>;
      const num = rec.value ?? rec.price ?? rec.y ?? rec.data;
      if (typeof num === "number") out.push(num);
      for (const val of Object.values(rec)) {
        if (Array.isArray(val)) walk(val);
      }
    }
  };
  walk(raw);
  return out.slice(0, 31);
}

/** Summarize the bottom/top indicator payload: count status signals (Buy/Sell/Hold). */
export function summarizeIndicatorStatus(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length === 0) return "N/A";
  const counts: Record<string, number> = {};
  for (const r of raw) {
    if (typeof r !== "object" || r === null) continue;
    const s = String((r as Record<string, unknown>).status ?? "").trim().toUpperCase();
    if (s === "BUY" || s === "SELL" || s === "HOLD") {
      const key = s[0] + s.slice(1).toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  const parts = (Object.entries(counts) as [string, number][]).sort((a, b) => b[1] - a[1]);
  if (parts.length === 0) return "N/A";
  return parts.map(([k, v]) => `${k} ${v}`).join(" · ");
}

/** Fetch one data endpoint and normalize to a MarketPulseEntry. */
export async function fetchMarketPulseEntry(endpoint: string, label: string): Promise<MarketPulseEntry> {
  try {
    const res = await api.blockbeatsData(endpoint);
    return {
      endpoint,
      label,
      value: endpoint === "bottom_top_indicator" ? summarizeIndicatorStatus(res?.data) : flattenValue(res?.data),
      trend: extractTrend(res?.data),
      raw: res?.data,
    };
  } catch {
    return { endpoint, label, value: "N/A", trend: null, raw: null };
  }
}

/** Fetch all Market Pulse metrics (tolerates individual failures). */
export async function fetchMarketPulse(): Promise<MarketPulseEntry[]> {
  const entries = await Promise.all(
    MARKET_PULSE_ENDPOINTS.map(({ endpoint, label }) => fetchMarketPulseEntry(endpoint, label)),
  );
  return entries.filter((e) => e.value !== "N/A" || e.trend !== null);
}

/** Networks available for top10_netflow heatmap. */
export const NETFLOW_NETWORKS = ["solana", "ethereum", "bsc", "base", "arbitrum", "ton"] as const;

export type NetflowRow = { symbol: string; netflow: number };

/** Parse the BlockBeats top10_netflow payload into up to 10 rows. */
export function parseNetflow(raw: unknown): NetflowRow[] {
  let rows: unknown[] = [];
  if (Array.isArray(raw)) rows = raw;
  else if (typeof raw === "object" && raw !== null) {
    const rec = raw as Record<string, unknown>;
    for (const v of Object.values(rec)) {
      if (Array.isArray(v)) {
        rows = v;
        break;
      }
    }
  }
  const out: NetflowRow[] = [];
  for (const r of rows) {
    if (typeof r !== "object" || r === null) continue;
    const rec = r as Record<string, unknown>;
    const symbol = String(
      rec.symbol ?? rec.token ?? rec.coin ?? rec.name ?? rec.asset ?? rec.code ?? "",
    );
    const num = rec.netflow ?? rec.net_flow ?? rec.amount ?? rec.value ?? rec.flow;
    const netflow = Number(num);
    if (!symbol || Number.isNaN(netflow)) continue;
    out.push({ symbol, netflow });
  }
  return out.sort((a, b) => Math.abs(b.netflow) - Math.abs(a.netflow)).slice(0, 10);
}

/** Fetch top10_netflow for a network. */
export async function fetchNetflow(network: string): Promise<NetflowRow[]> {
  try {
    const res = await api.blockbeatsData("top10_netflow", { network });
    return parseNetflow(res?.data);
  } catch {
    return [];
  }
}
