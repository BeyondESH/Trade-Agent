import { useMemo } from "react";
import type { Datafeed, Period, SymbolInfo } from "@klinecharts/pro";
import type { Chart } from "klinecharts";
import type { KLineChartProHandle } from "./KLineChartProView";
import { ChartCell } from "./ChartCell";

const LAYOUT_CLASSES: Record<number, string> = {
  1: "grid-cols-1 grid-rows-1",
  2: "grid-cols-2 grid-rows-1",
  3: "grid-cols-3 grid-rows-1",
  4: "grid-cols-2 grid-rows-2",
  6: "grid-cols-3 grid-rows-2",
  8: "grid-cols-4 grid-rows-2",
};

export const CHART_LAYOUTS = [1, 2, 4, 6, 8];

export interface CellState {
  symbol: SymbolInfo;
  period: Period;
}

interface ChartGridProps {
  count: number;
  /** Per-cell initial symbol/period; length must match `count`. */
  cells: CellState[];
  periods: Period[];
  /** Shared datafeed for the first cell only; the rest own their own. */
  datafeed?: Datafeed;
  theme: string;
  locale: string;
  watermarkFor?: (cell: CellState) => string;
  activeIndex: number;
  onActivate: (index: number) => void;
  onCellHandle: (index: number, handle: KLineChartProHandle | null) => void;
  onCellReady: (index: number, chart: Chart | null) => void;
  onCellSymbolChange: (index: number, symbol: SymbolInfo) => void;
  onCellPeriodChange: (index: number, period: Period) => void;
}

/**
 * Center chart area: N *peer* chart instances in a TV-style grid. Any cell can
 * become the active one (click); the App routes top-bar actions to the active
 * cell and uses the sync bus to mirror state across cells.
 */
export function ChartGrid({
  count,
  cells,
  periods,
  datafeed,
  theme,
  locale,
  watermarkFor,
  activeIndex,
  onActivate,
  onCellHandle,
  onCellReady,
  onCellSymbolChange,
  onCellPeriodChange,
}: ChartGridProps) {
  const indices = useMemo(() => Array.from({ length: Math.max(1, count) }, (_, i) => i), [count]);
  const cls = LAYOUT_CLASSES[count] ?? LAYOUT_CLASSES[1];
  return (
    <div
      className={`grid h-full min-h-0 gap-px ${cls}`}
      data-testid="chart-grid"
      data-active={activeIndex}
    >
      {indices.map((i) => {
        const cell = cells[i];
        if (!cell) return null;
        return (
          <div
            key={i}
            onMouseDown={() => onActivate(i)}
            className={`relative min-h-0 min-w-0 ${
              i === activeIndex ? "ring-1 ring-inset ring-accent" : ""
            }`}
            data-testid={`chart-cell-${i}`}
            data-active={i === activeIndex ? "true" : "false"}
          >
            <ChartCell
              ref={(h) => onCellHandle(i, h)}
              symbol={cell.symbol}
              period={cell.period}
              periods={periods}
              watermarkText={watermarkFor ? watermarkFor(cell) : undefined}
              theme={theme}
              locale={locale}
              datafeed={i === 0 ? datafeed : undefined}
              onSymbolChange={(s) => onCellSymbolChange(i, s)}
              onPeriodChange={(p) => onCellPeriodChange(i, p)}
              onReady={(c) => onCellReady(i, c)}
            />
          </div>
        );
      })}
    </div>
  );
}
