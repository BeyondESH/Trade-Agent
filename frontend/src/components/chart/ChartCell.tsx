import { forwardRef, useEffect, useMemo, useRef } from "react";
import type { Chart } from "klinecharts";
import type { Datafeed, Period, SymbolInfo } from "@klinecharts/pro";
import { BitgetDatafeed } from "../../api/datafeed";
import { KLineChartProView, type KLineChartProHandle } from "./KLineChartProView";

interface ChartCellProps {
  symbol: SymbolInfo;
  period: Period;
  periods: Period[];
  watermarkText?: string;
  /** Inject a shared datafeed (used by the primary cell); cells left without one own their own. */
  datafeed?: Datafeed;
  theme?: string;
  locale?: string;
  onSymbolChange?: (symbol: SymbolInfo) => void;
  onPeriodChange?: (period: Period) => void;
  onReady?: (chart: Chart | null) => void;
}

/**
 * One independent chart instance. Each cell owns its own datafeed so that
 * multiple charts subscribed to the same symbol/period do not fight over the
 * shared subscription map, unless a datafeed is injected. Theme/locale follow
 * the global settings (multi-layout parity). The watermark keeps itself in
 * sync with the cell's current symbol/period.
 */
export const ChartCell = forwardRef<KLineChartProHandle, ChartCellProps>(function ChartCell(
  {
    symbol,
    period,
    periods,
    watermarkText,
    datafeed: injected,
    theme,
    locale,
    onSymbolChange,
    onPeriodChange,
    onReady,
  },
  ref,
) {
  const own = useMemo(() => new BitgetDatafeed(), []);
  const datafeed = injected ?? own;
  const localRef = useRef<KLineChartProHandle | null>(null);

  useEffect(() => {
    const root = localRef.current?.getRoot();
    const el = root?.querySelector<HTMLElement>(".klinecharts-pro-watermark");
    if (el) el.textContent = `${symbol.ticker} · ${period.text}`;
  }, [symbol.ticker, period.text]);

  return (
    <KLineChartProView
      ref={(h) => {
        localRef.current = h;
        if (typeof ref === "function") ref(h);
        else if (ref) ref.current = h;
      }}
      symbol={symbol}
      period={period}
      periods={periods}
      datafeed={datafeed}
      theme={theme ?? "dark"}
      locale={locale}
      mainIndicators={["MA"]}
      subIndicators={[]}
      watermarkText={watermarkText}
      onSymbolChange={onSymbolChange}
      onPeriodChange={onPeriodChange}
      onReady={onReady}
    />
  );
});
