import { useCallback, useEffect, useRef } from "react";
import type { Chart } from "klinecharts";
import type { SymbolInfo, Period } from "@klinecharts/pro";
import { chartSyncBus } from "./chartSyncBus";
import {
  applyRemoteCrosshair,
  applyRemoteDraw,
  applyRemoteRange,
  DrawSyncRegistry,
  guarded,
} from "./chartSyncActions";
import { setupCellChart, type CellSetup } from "./cellChartSetup";
import type { SuppressRef } from "./chartSyncActions";
import { periodToTimeframe } from "../api/datafeed";

interface CellSyncOptions {
  index: number;
  chart: Chart | null;
  symbol: SymbolInfo;
  period: Period;
  active: boolean;
}

/**
 * Wire one klinecharts instance (owned by a KLineChartPro cell) into the
 * shared cross-chart sync bus: emits crosshair/range/draw events and applies
 * remote events back onto the chart. A cell only participates while mounted.
 */
export function useCellSync({ index, chart, symbol, period, active }: CellSyncOptions): void {
  const suppress = useRef<SuppressRef>({ current: 0 });
  const registry = useRef(new DrawSyncRegistry());
  const setupRef = useRef<CellSetup | null>(null);

  const symbolKey = useCallback(
    () => `${symbol.market ?? "USDT-FUTURES"}:${symbol.ticker}`,
    [symbol],
  );

  const seriesKey = useCallback(
    () => `${symbol.market ?? "USDT-FUTURES"}:${symbol.ticker}:${periodToTimeframe(period)}`,
    [symbol, period],
  );

  // Attach local emissions to the chart once.
  useEffect(() => {
    if (!chart) return;
    const c = chart;
    const idx = index;
    setupRef.current = setupCellChart(c, idx, chartSyncBus, suppress.current, registry.current, {
      isPrimary: () => active,
      onSelect: () => {},
      onVisibleRange: () => {},
      getSymbolKey: symbolKey,
      getSeriesKey: seriesKey,
      recordOverlay: () => {},
      dropOverlay: () => {},
    });
    return () => {
      setupRef.current?.cleanup();
      setupRef.current = null;
      registry.current.clear();
    };
  }, [chart, index, active, symbolKey, seriesKey]);

  // Listen for remote events targeting this cell.
  useEffect(() => {
    if (!chart) return;
    const c = chart;
    const idx = index;
    const unsub = chartSyncBus.register(idx, (event) => {
      if (event.origin === idx) return;
      switch (event.kind) {
        case "crosshair": {
          const { timestamp } = event.payload as { timestamp: number | null };
          if (timestamp == null) return;
          guarded(suppress.current, () => applyRemoteCrosshair(c, timestamp));
          break;
        }
        case "range": {
          const { fromTs, toTs } = event.payload as { fromTs: number; toTs: number };
          guarded(suppress.current, () => applyRemoteRange(c, fromTs, toTs));
          break;
        }
        case "draw": {
          const payload = event.payload as Parameters<typeof applyRemoteDraw>[2];
          if (payload.sourceSeries && payload.sourceSeries !== symbolKey()) break;
          guarded(suppress.current, () => applyRemoteDraw(c, registry.current, payload));
          break;
        }
        default:
          break;
      }
    });
    return unsub;
  }, [chart, index, symbolKey]);

  // Active-cell flag may change the `isPrimary` closure; simplest is to
  // re-attach so selection-aware wiring stays correct.
  useEffect(() => {
    return () => {
      suppress.current = { current: 0 };
    };
  }, []);
}
