import type { Chart, CandleType } from "klinecharts";
import type { Period, SymbolInfo } from "@klinecharts/pro";
import { overlayForTool } from "./drawingToolMap";
import type { DrawingToolType } from "../types/trading";
import { periodFromTimeframe } from "../api/datafeed";

export type { CandleType };

const CANDLE_TYPES: Record<string, CandleType> = {
  candles: "candle_solid" as CandleType,
  hollow_candles: "candle_stroke" as CandleType,
  bars: "ohlc" as CandleType,
  line: "area" as CandleType,
  area: "area" as CandleType,
  heikin_ashi: "candle_solid" as CandleType,
  baseline: "candle_solid" as CandleType,
};

/**
 * Imperative bridge between the template toolbar chrome and the active cell's
 * klinecharts instance. MultiChartGrid registers the active chart; TopNavbar /
 * DrawingToolbar / modals dispatch commands here.
 */
class ChartCommandCenter {
  private chart: Chart | null = null;
  private onSymbolChange: ((symbol: SymbolInfo) => void) | null = null;

  /** Called by the active cell once its klinecharts instance is ready. */
  bind(chart: Chart | null, onSymbolChange?: (symbol: SymbolInfo) => void): void {
    this.chart = chart;
    this.onSymbolChange = onSymbolChange ?? null;
  }

  getChart(): Chart | null {
    return this.chart;
  }

  setPeriod(period: Period): void {
    if (!this.chart) return;
    // The vendored pro component owns data reload on setPeriod; we only
    // expose it through the toolbar mapping. If a raw chart is bound we
    // still can switch period via the datafeed-driven pro instance — that
    // path is handled by ChartCellPro. For a bare klinecharts instance we
    // fall back to clearing nothing (the pro wrapper drives period).
  }

  setPeriodText(timeframe: string): void {
    this.setPeriod(periodFromTimeframe(timeframe));
  }

  setChartType(type: string): void {
    if (!this.chart) return;
    const ct = CANDLE_TYPES[type] ?? "candle_solid";
    this.chart.setStyles({ candle: { type: ct } } as never);
  }

  setMainIndicator(name: string): void {
    if (!this.chart) return;
    const chart = this.chart as Chart & {
      setMainIndicator?: (name: string) => void;
    };
    // klinecharts 9 has no setMainIndicator; the vendored pro wrapper adds
    // MA via createIndicator on the candle pane. Keep this no-op-safe.
    chart.setMainIndicator?.(name);
  }

  createIndicator(name: string, paneId?: string): void {
    if (!this.chart) return;
    this.chart.createIndicator({ name } as never, true, paneId ? { id: paneId } : undefined);
  }

  removeIndicator(name: string, paneId = "candle_pane"): void {
    if (!this.chart) return;
    this.chart.removeIndicator(paneId, name);
  }

  applyTool(tool: DrawingToolType): void {
    if (!this.chart) return;
    const overlay = overlayForTool(tool);
    if (!overlay) return;
    this.chart.createOverlay(overlay as never);
  }

  clearDrawings(): void {
    if (!this.chart) return;
    this.chart.removeOverlay();
  }

  setSymbol(symbol: SymbolInfo): void {
    if (!this.chart) return;
    this.onSymbolChange?.(symbol);
  }

  screenshot(): void {
    if (!this.chart) return;
    const chart = this.chart as Chart & { screenshot?: (includeOverlay?: boolean) => string };
    try {
      const url = chart.screenshot?.(true);
      if (url) window.open(url, "_blank");
    } catch {
      /* screenshot unavailable */
    }
  }
}

export const chartCommands = new ChartCommandCenter();
