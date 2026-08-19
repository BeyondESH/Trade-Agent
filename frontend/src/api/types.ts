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

export interface GridCellPersist {
  category: string;
  symbol: string;
  timeframe: string;
  indicators?: { paneId: string; name: string }[];
}

export interface GridLayoutPersist {
  layoutCount: number;
  activeCell: number;
  syncFlags: {
    symbol: boolean;
    period: boolean;
    crosshair: boolean;
    range: boolean;
    draw: boolean;
  };
  cells: GridCellPersist[];
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
  /** Multi-chart workspace layout (tv-multichart-sync). */
  grid?: GridLayoutPersist;
}
