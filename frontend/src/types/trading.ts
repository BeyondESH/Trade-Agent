export type Timeframe = '1s' | '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D' | '1W' | '1M';

export type ChartType = 'candles' | 'heikin_ashi' | 'line' | 'area' | 'hollow_candles' | 'bars' | 'baseline';

export type ThemeMode = 'dark' | 'light';

export type DesktopViewMode =
  | 'chart'
  | 'screener'
  | 'heatmaps'
  | 'markets'
  | 'community'
  | 'news'
  | 'pine'
  | 'brokers';

export interface DesktopTab {
  id: string;
  title: string;
  type: DesktopViewMode;
  symbol?: string;
  symbolId?: string;
  timeframe?: Timeframe;
  layout?: string;
  icon?: string;
  isPinned?: boolean;
  isModified?: boolean;
}

export interface Candle {
  time: number; // Unix timestamp in seconds or ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolInfo {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  category: 'crypto' | 'stocks' | 'forex' | 'indices' | 'futures' | 'commodities';
  price: number;
  change24h: number;
  change24hPercent: number;
  high24h: number;
  low24h: number;
  volume24h: string;
  digits: number;
  baseAsset: string;
  quoteAsset: string;
  icon?: string;
  description: string;
  marketCap?: string;
  peRatio?: string;
  week52High?: number;
  week52Low?: number;
  technicalRating?: 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';
}

export type DrawingToolType =
  | 'cursor'
  | 'crosshair'
  | 'dot'
  | 'eraser'
  | 'trendline'
  | 'ray'
  | 'info_line'
  | 'horizontal_line'
  | 'horizontal_ray'
  | 'vertical_line'
  | 'parallel_channel'
  | 'fib_retracement'
  | 'fib_extension'
  | 'pitchfork'
  | 'rectangle'
  | 'circle'
  | 'brush'
  | 'highlighter'
  | 'text'
  | 'callout'
  | 'price_label'
  | 'long_position'
  | 'short_position'
  | 'price_range'
  | 'date_range'
  | 'measure';

export interface Point {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingToolType;
  points: Point[];
  color: string;
  lineWidth: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  fillColor?: string;
  fillOpacity?: number;
  text?: string;
  fontSize?: number;
  // For Long/Short position tool
  riskReward?: {
    entryPrice: number;
    targetPrice: number;
    stopLossPrice: number;
    riskAmount: number;
    rewardAmount: number;
    ratio: number;
  };
  visible: boolean;
  locked: boolean;
}

export interface IndicatorConfig {
  id: string;
  name: string;
  shortName: string;
  type: 'overlay' | 'pane';
  visible: boolean;
  color: string;
  color2?: string;
  color3?: string;
  params: Record<string, number | string | boolean>;
  values?: number[] | { [key: string]: number[] };
}

export interface Order {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LIMIT';
  price: number;
  amount: number;
  filled: number;
  status: 'FILLED' | 'WORKING' | 'CANCELLED';
  tp?: number;
  sl?: number;
  leverage: number;
  timestamp: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  amount: number;
  margin: number;
  leverage: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  tp?: number;
  sl?: number;
  timestamp: number;
}

export interface AccountState {
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface BacktestResult {
  strategyName: string;
  netProfit: number;
  netProfitPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  trades: Array<{
    id: string;
    type: 'LONG' | 'SHORT';
    entryTime: string;
    exitTime: string;
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    pnlPercent: number;
    size: number;
    reason: string;
  }>;
  equityCurve: Array<{ time: string; equity: number }>;
}

export interface AlertItem {
  id: string;
  symbol: string;
  condition: 'Crossing' | 'Crossing Up' | 'Crossing Down' | 'Greater Than' | 'Less Than';
  targetPrice: number;
  createdAt: string;
  triggered: boolean;
  triggerTime?: string;
  note: string;
  frequency: 'Only Once' | 'Every Time';
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  time: string;
  category: 'Crypto' | 'Macro' | 'Stocks' | 'Forex';
  sentiment: 'bullish' | 'bearish' | 'neutral';
  summary: string;
  relatedSymbols: string[];
}

export interface EconomicEvent {
  id: string;
  time: string;
  date: string;
  country: string;
  currency: string;
  event: string;
  impact: 'high' | 'medium' | 'low';
  actual?: string;
  forecast?: string;
  previous?: string;
}

export interface OrderBookEntry {
  price: number;
  amount: number;
  total: number;
}

export interface HeatmapAsset {
  symbol: string;
  name: string;
  marketCap: number; // in Billions USD
  price: number;
  changePercent: number;
  volume: string;
  sector: string;
}

export interface CommunityIdea {
  id: string;
  title: string;
  author: string;
  authorRank: string;
  avatar: string;
  symbol: string;
  sentiment: 'LONG' | 'SHORT' | 'NEUTRAL';
  timeframe: string;
  likes: number;
  comments: number;
  time: string;
  description: string;
  tags: string[];
}

export interface BrokerAccount {
  id: string;
  name: string;
  logo: string;
  status: 'connected' | 'disconnected';
  type: string;
  description: string;
  supportedAssets: string[];
  features: string[];
}
