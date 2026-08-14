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

export interface ProviderConfig {
  kind: string;
  model: string;
  base_url: string;
  api_key: string;
  near_pct: number;
  min_strength: number;
  leverage: number;
  category: string;
}

export interface RiskConfig {
  margin_pct: number;
  max_drawdown_pct: number;
  max_leverage: number;
  max_adds: number;
  max_symbol_margin_pct: number;
}

export interface AppConfig {
  provider: ProviderConfig;
  risk: RiskConfig;
  system_prompt: string | null;
  manual_rules: string[];
}

export interface AgentDecision {
  action: "open" | "close" | "hold";
  symbol: string;
  side: string | null;
  reference_price: number | null;
  reason: string;
  confidence: number;
}

export interface Portfolio {
  equity: number;
  peak_equity: number;
  positions: Record<string, unknown>;
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

export interface SeriesRef {
  category: string;
  symbol: string;
  timeframe: string;
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
