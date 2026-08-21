import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Chart } from "klinecharts";
import type { SymbolInfo as ProSymbolInfo } from "@klinecharts/pro";
import { ThemeMode } from "../../../types/trading";
import type { BacktestJobResult, SeriesRef } from "../../../api/types";
import { api } from "../../../api/client";
import { KLineChartProView } from "../../chart/KLineChartProView";
import { BitgetDatafeed, periodFromTimeframe } from "../../../api/datafeed";
import { signalsToOverlays } from "../../../lib/signalMarks";
import { Panel } from "./ui";

interface Props {
  symbol: string;
  timeframe: string;
  series: SeriesRef;
  result: BacktestJobResult | null;
  theme: ThemeMode;
  height?: number;
}

/** Self-contained kline chart inside QUANT LAB: owns a private BitgetDatafeed,
 * follows the lab's symbol/timeframe, and overlays backtest long/short signal
 * marks (groupId "backtest-signals") once a result is available. */
export const SignalKLineChart: React.FC<Props> = ({
  symbol,
  timeframe,
  series,
  result,
  theme,
  height = 420,
}) => {
  const datafeed = useMemo(() => new BitgetDatafeed(), []);
  const chartRef = useRef<Chart | null>(null);
  const [chartReady, setChartReady] = useState(false);

  const proSymbol: ProSymbolInfo = useMemo(
    () => ({
      ticker: symbol,
      shortName: symbol,
      name: symbol,
      exchange: series.category,
      market: series.category,
    }),
    [symbol, series.category],
  );

  const period = useMemo(() => periodFromTimeframe(timeframe), [timeframe]);

  const onReady = (chart: Chart | null) => {
    chartRef.current = chart;
    setChartReady(!!chart);
  };

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    chart.removeOverlay({ groupId: "backtest-signals" });
    const sig = result?.series?.signal ?? [];
    const openTime = result?.series?.open_time ?? [];
    if (sig.length === 0 || sig.length !== openTime.length) return;

    let cancelled = false;
    api
      .candles(series, undefined, undefined, 5000)
      .then((r) => {
        if (cancelled) return;
        const priceByTs = new Map<number, number>();
        for (const c of r.candles) priceByTs.set(c.open_time, c.close);
        const overlays = signalsToOverlays(sig, openTime, priceByTs);
        if (overlays.length > 0) chart.createOverlay(overlays);
      })
      .catch(() => {
        /* signal overlay is best-effort; the chart still renders */
      });
    return () => {
      cancelled = true;
    };
  }, [result, series, chartReady]);

  return (
    <Panel title="信号 K 线" theme={theme}>
      <div style={{ height }}>
        <KLineChartProView
          symbol={proSymbol}
          period={period}
          datafeed={datafeed}
          theme={theme === "dark" ? "dark" : "light"}
          onReady={onReady}
        />
      </div>
    </Panel>
  );
};
