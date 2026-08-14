import type { Chart, DeepPartial, KLineData, Styles } from 'klinecharts'

export interface SymbolInfo {
  ticker: string
  name?: string
  shortName?: string
  exchange?: string
  market?: string
  pricePrecision?: number
  volumePrecision?: number
  priceCurrency?: string
  type?: string
  logo?: string
}

export interface Period {
  multiplier: number
  timespan: string
  text: string
}

export type DatafeedSubscribeCallback = (data: KLineData) => void

export interface Datafeed {
  searchSymbols(search?: string): Promise<SymbolInfo[]>
  getHistoryKLineData(symbol: SymbolInfo, period: Period, from: number, to: number): Promise<KLineData[]>
  subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void
  unsubscribe(symbol: SymbolInfo, period: Period): void
}

export interface ChartProOptions {
  container: string | HTMLElement
  styles?: DeepPartial<Styles>
  watermark?: string | Node
  theme?: string
  locale?: string
  drawingBarVisible?: boolean
  symbol: SymbolInfo
  period: Period
  periods?: Period[]
  timezone?: string
  mainIndicators?: string[]
  subIndicators?: string[]
  datafeed: Datafeed
  onSymbolChange?: (symbol: SymbolInfo) => void
  onPeriodChange?: (period: Period) => void
}

export interface ChartPro {
  setTheme(theme: string): void
  getTheme(): string
  setStyles(styles: DeepPartial<Styles>): void
  getStyles(): Styles
  setLocale(locale: string): void
  getLocale(): string
  setTimezone(timezone: string): void
  getTimezone(): string
  setSymbol(symbol: SymbolInfo): void
  getSymbol(): SymbolInfo
  setPeriod(period: Period): void
  getPeriod(): Period
  getChart(): Chart | null
}

export class KLineChartPro implements ChartPro {
  constructor(options: ChartProOptions)
  setTheme(theme: string): void
  getTheme(): string
  setStyles(styles: DeepPartial<Styles>): void
  getStyles(): Styles
  setLocale(locale: string): void
  getLocale(): string
  setTimezone(timezone: string): void
  getTimezone(): string
  setSymbol(symbol: SymbolInfo): void
  getSymbol(): SymbolInfo
  setPeriod(period: Period): void
  getPeriod(): Period
  getChart(): Chart | null
}

export class DefaultDatafeed implements Datafeed {
  constructor(apiKey: string)
  searchSymbols(search?: string): Promise<SymbolInfo[]>
  getHistoryKLineData(symbol: SymbolInfo, period: Period, from: number, to: number): Promise<KLineData[]>
  subscribe(symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void
  unsubscribe(symbol: SymbolInfo, period: Period): void
}

export function loadLocales(locale: string, messages: Record<string, string>): void
