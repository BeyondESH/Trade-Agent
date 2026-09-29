export interface Candle {
  open_time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Level {
  price: number;
  kind: "support" | "resistance";
  strength: number;
  sources: string[];
}

export interface AnalyzeResponse {
  price: number;
  indicators: Record<string, number | null>;
  levels: Level[];
}

export interface Trendline {
  kind: string;
  slope: number;
  intercept: number;
  projection: number;
}

export interface Box {
  lower: number;
  upper: number;
}

export interface StructureResponse {
  swings: { open_time: number; price: number; kind: string }[];
  trendlines: Trendline[];
  box: Box | null;
  liquidity: unknown[];
  order_blocks: Record<string, unknown>;
  bos_choch: unknown[];
}

export interface Snapshot {
  price?: number;
  portfolio?: { equity: number; positions: string[] };
  levels?: Level[];
  macd_hist?: number | null;
  last_candle?: {
    open_time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  error?: string;
}

export type MarketCategory = "SPOT" | "USDT-FUTURES";

export type SymbolType = "crypto" | "metal" | "stock" | "commodity";

export const MARKET_CATEGORIES: MarketCategory[] = ["SPOT", "USDT-FUTURES"];

/** Bitget instType/品类术语 -> 中文展示标签。未知品类由 categoryLabel 兜底返回原值。 */
export const CATEGORY_LABELS: Record<string, string> = {
  SPOT: "现货",
  MARGIN: "现货杠杆",
  "USDT-FUTURES": "U本位合约",
  "USDC-FUTURES": "USDC本位合约",
  "COIN-FUTURES": "币本位合约",
  "SUSDT-FUTURES": "U本位模拟合约",
  "SUSDC-FUTURES": "USDC本位模拟合约",
  "SCOIN-FUTURES": "币本位模拟合约",
};

/** 品类 -> 中文展示标签（未知值原样返回）。仅用于展示，不得用于路由/键。 */
export function categoryLabel(category?: string): string {
  if (!category) return "";
  return CATEGORY_LABELS[category] ?? category;
}

export interface SeriesRef {
  category: string;
  symbol: string;
  timeframe: string;
}

export interface AlertRecord {
  id: string;
  symbol: string;
  condition: "above" | "below";
  threshold: number;
  enabled: boolean;
  triggered: boolean;
  createdAt: number;
}

export interface BackfillResponse {
  series: string;
  appended: number;
  earliest_reached: boolean;
}

export interface Ticker {
  instId: string;
  symbol: string;
  category?: MarketCategory;
  lastPr?: string;
  open24h?: string;
  high24h?: string;
  low24h?: string;
  askPr?: string;
  bidPr?: string;
  change24h?: string;
  price24hPcnt?: string;
  baseVolume?: string;
  volume24h?: string;
  quoteVolume?: string;
  turnover24h?: string;
  markPrice?: string;
  fundingRate?: string;
  ts?: string;
  [key: string]: unknown;
}

export type TickerSortKey =
  | "symbol"
  | "price"
  | "change"
  | "volume"
  | "turnover"
  | "funding"
  | "amplitude"
  | "mark";

export interface Instrument {
  symbol: string;
  instId?: string;
  category?: MarketCategory;
  baseCoin?: string;
  quoteCoin?: string;
  /** price precision (Bitget REST uses pricePlace) */
  pricePlace?: string;
  /** quantity precision (Bitget REST uses volumePlace) */
  volumePlace?: string;
  /** normalized price precision (v3 instruments) */
  pricePrecision?: string;
  /** normalized quantity precision (v3 instruments) */
  quantityPrecision?: string;
  symbolStatus?: string;
  minTradeNum?: string;
  priceEndStep?: string;
  sizeMultiplier?: string;
  symbolType?: SymbolType;
  isRwa?: string;
  isReality?: string;
  [key: string]: unknown;
}

export interface ChartPoint {
  timestamp?: number;
  value?: number;
}

export interface ChartConfig {
  indicators: { name: string; pane: "candle" | "sub" }[];
  drawings: {
    id: string;
    name: string;
    points: ChartPoint[];
    styles?: Record<string, unknown>;
    groupId?: string;
  }[];
  layers: { sr: boolean; structure: boolean; smc: boolean };
}

// ---------------------------------------------------------------------------
// Research / strategy-proposal layer (read-only projection of the agent worker)
// Mirrors the backend `StrategyProposal` contract; the frontend never mutates it.
// ---------------------------------------------------------------------------

export type ProposalAction = "open_long" | "open_short" | "close" | "flat";

export type ProposalEntryKind = "market" | "limit";

export interface ProposalEntry {
  kind: ProposalEntryKind;
  price?: number;
}

export interface ProposalProvenance {
  model: string;
  prompt_ver: string;
  research_thread_id: string;
}

/**
 * Compact list projection (`GET /research/proposals`). The detail endpoint
 * returns the full {@link StrategyProposal}.
 */
export interface ProposalMeta {
  proposal_id: string;
  /** ISO-8601 string or epoch seconds. */
  produced_at: string | number;
  /** ISO-8601 string or epoch seconds. */
  expires_at: string | number;
  symbol: string;
  category: string;
  timeframe: string;
  action: ProposalAction;
  confidence: number;
}

export interface StrategyProposal extends ProposalMeta {
  entry: ProposalEntry;
  stop_loss?: number;
  take_profit?: number;
  horizon: string;
  rationale: string;
  evidence: string[];
  provenance: ProposalProvenance;
}

export type ExecutionStatus = "pending" | "running" | "succeeded" | "failed" | "fail_closed";

export interface ExecutionNodeEvent {
  node: string;
  status?: string;
  detail?: string;
  ts?: string | number;
}

/** Execution run status object (`GET /executions/{run_id}`). */
export interface ExecutionRun {
  run_id: string;
  proposal_id: string;
  symbol?: string;
  status: ExecutionStatus;
  /** Present when the run terminated fail-closed / failed. */
  reason?: string | null;
  nodes: ExecutionNodeEvent[];
  started_at?: string | number;
  finished_at?: string | number | null;
}

/**
 * One frame of `GET /research/{thread_id}/stream` (text/event-stream). The
 * backend tags every frame with `type`; the remaining keys are event-specific.
 */
export type ResearchStreamEvent =
  | { type: "node"; node: string; detail?: string; status?: string }
  | { type: "text"; text: string }
  | { type: "done"; status?: string; reason?: string }
  | { type: "error"; message?: string; reason?: string };
