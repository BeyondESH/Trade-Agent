import { useMemo } from "react";
import type { Chart } from "klinecharts";
import type { Candle } from "../../api/types";

interface Props {
  chart: Chart | null;
  candles: Candle[];
  symbol: string;
  period: string;
  exchange: string;
}

interface IndicatorEntry {
  paneId: string;
  name: string;
  visible: boolean;
  value: string;
  precision: number;
}

/** TradingView-style floating legend (top-left of the chart pane). */
export function ChartLegend({ chart, candles, symbol, period, exchange }: Props) {
  const last = candles.length ? candles[candles.length - 1] : undefined;
  const firstOpen = candles.length ? candles[0].open : undefined;
  const change = last && firstOpen ? ((last.close - firstOpen) / firstOpen) * 100 : undefined;
  const up = (change ?? 0) >= 0;

  const indicators = useMemo<IndicatorEntry[]>(() => {
    if (!chart) return [];
    const all = chart.getIndicatorByPaneId() as Map<string, Map<string, import("klinecharts").Indicator>> | undefined;
    if (!all) return [];
    const rows: IndicatorEntry[] = [];
    for (const [paneId, inds] of all) {
      for (const ind of inds.values()) {
        const key = ind.figures[0]?.key;
        const lastResult = ind.result[ind.result.length - 1];
        let value = "--";
        if (key != null && lastResult && typeof lastResult === "object") {
          const v = (lastResult as Record<string, unknown>)[key];
          if (typeof v === "number" && Number.isFinite(v)) value = v.toFixed(ind.precision);
        }
        rows.push({
          paneId,
          name: ind.shortName || ind.name,
          visible: ind.visible,
          value,
          precision: ind.precision,
        });
      }
    }
    return rows;
  }, [chart]);

  const toggleVisible = (row: IndicatorEntry) => {
    chart?.overrideIndicator({ name: row.name, visible: !row.visible }, row.paneId);
  };
  const remove = (row: IndicatorEntry) => {
    chart?.removeIndicator(row.paneId, row.name);
  };

  return (
    <div
      className="pointer-events-none absolute left-[52px] top-1 z-20 select-none rounded-modal border border-border bg-panel/85 px-2.5 py-1.5 text-[11px] leading-tight shadow-float backdrop-blur-sm"
      data-testid="chart-legend"
    >
      <div className="font-semibold text-text">
        {symbol} <span className="font-normal text-muted">· {period} · {exchange}</span>
      </div>
      <div className="tnum mt-0.5 text-muted">
        {last ? (
          <>
            O {last.open} H {last.high} L {last.low}{" "}
            <span style={{ color: up ? "var(--tv-up)" : "var(--tv-down)" }}>
              C {last.close}
            </span>{" "}
            {change !== undefined && (
              <span style={{ color: up ? "var(--tv-up)" : "var(--tv-down)" }}>
                {up ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            )}
          </>
        ) : (
          "--"
        )}
      </div>
      {indicators.map((row) => (
        <div
          key={`${row.paneId}-${row.name}`}
          className="group flex items-center gap-2"
          data-testid={`legend-indicator-${row.name}`}
        >
          <span className="text-muted">
            {row.name} {row.value}
          </span>
          <span className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={() => toggleVisible(row)}
              title="visible"
              className="text-muted hover:text-text"
            >
              {row.visible ? "👁" : "🚫"}
            </button>
            <button onClick={() => remove(row)} title="remove" className="text-muted hover:text-down">
              ✕
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
