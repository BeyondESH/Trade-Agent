import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Chart } from "klinecharts";
import {
  KLineChartPro,
  type ChartPro,
  type Datafeed,
  type Period,
  type SymbolInfo,
} from "@klinecharts/pro";
import "../../../vendor/klinecharts-pro/dist/klinecharts-pro.css";
import "../../klinecharts-pro-theme.css";
import { FONT_FAMILY_STACK } from "../../lib/fonts";
import {
  loadPinnedTimeframes,
  savePinnedTimeframes,
} from "../../lib/periodsStore";

export interface KLineChartProHandle {
  setSymbol(symbol: SymbolInfo): void;
  setPeriod(period: Period): void;
  setTheme(theme: string): void;
  setLocale(locale: string): void;
  getChart(): Chart | null;
  getRoot(): HTMLElement | null;
}

/**
 * Bitget-native timeframe set, aligned with the backend-supported granularities
 * and the store's pinned-timeframe identifiers. `period.text` intentionally
 * equals the canonical identifier (`periodToTimeframe` output) so the vendored
 * period bar can match a pinned identifier to its Period directly.
 */
export const NATIVE_PERIODS: Period[] = [
  { multiplier: 1, timespan: "second", text: "1s" },
  { multiplier: 1, timespan: "minute", text: "1m" },
  { multiplier: 3, timespan: "minute", text: "3m" },
  { multiplier: 5, timespan: "minute", text: "5m" },
  { multiplier: 15, timespan: "minute", text: "15m" },
  { multiplier: 30, timespan: "minute", text: "30m" },
  { multiplier: 1, timespan: "hour", text: "1h" },
  { multiplier: 2, timespan: "hour", text: "2h" },
  { multiplier: 4, timespan: "hour", text: "4h" },
  { multiplier: 6, timespan: "hour", text: "6h" },
  { multiplier: 12, timespan: "hour", text: "12h" },
  { multiplier: 1, timespan: "day", text: "1d" },
  { multiplier: 3, timespan: "day", text: "3d" },
  { multiplier: 1, timespan: "week", text: "1w" },
  { multiplier: 1, timespan: "month", text: "1mo" },
];

/** Group a period list by time unit for the expandable panel. */
export const PERIOD_GROUPS: { unit: string; label: string; periods: Period[] }[] = [
  { unit: "second", label: "秒", periods: [] },
  { unit: "minute", label: "分钟", periods: [] },
  { unit: "hour", label: "小时", periods: [] },
  { unit: "day", label: "天", periods: [] },
  { unit: "week", label: "周/月", periods: [] },
];
export function groupPeriods(periods: Period[]) {
  const grouped = PERIOD_GROUPS.map((g) => ({ ...g, periods: [] as Period[] }));
  for (const p of periods) {
    const g = grouped.find((x) =>
      x.unit === p.timespan ||
      (x.unit === "week" && (p.timespan === "week" || p.timespan === "month")),
    );
    if (g) g.periods.push(p);
  }
  return grouped.filter((g) => g.periods.length > 0);
}

interface Props {
  symbol: SymbolInfo;
  period: Period;
  periods?: Period[];
  datafeed: Datafeed;
  theme?: string;
  locale?: string;
  watermarkText?: string;
  onSymbolChange?: (symbol: SymbolInfo) => void;
  onPeriodChange?: (period: Period) => void;
  onReady?: (chart: Chart | null) => void;
}

export const KLineChartProView = forwardRef<KLineChartProHandle, Props>(
  function KLineChartProView(props, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const proRef = useRef<ChartPro | null>(null);
    const propsRef = useRef(props);
    propsRef.current = props;
    // Guards against React StrictMode's double-mount (dev) and fast remounts:
    // the second mount reuses the live instance instead of creating a second
    // chart (vendor KLineChartPro has no dispose(), so a duplicated instance
    // would steal the datafeed subscription and leave the visible chart stale).
    const mountedRef = useRef(false);
    const disposeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      // StrictMode remount / fast remount while the instance is still alive:
      // cancel the pending disposal scheduled by the previous cleanup and reuse
      // the existing chart so there is exactly one instance on the page. The
      // returned cleanup schedules disposal for when the reused component truly
      // unmounts.
      if (mountedRef.current) {
        if (disposeTimerRef.current) {
          clearTimeout(disposeTimerRef.current);
          disposeTimerRef.current = null;
        }
        return () => {
          disposeTimerRef.current = setTimeout(() => {
            propsRef.current.datafeed.unsubscribe(
              propsRef.current.symbol,
              propsRef.current.period,
            );
            if (containerRef.current) containerRef.current.innerHTML = "";
            proRef.current = null;
            mountedRef.current = false;
            disposeTimerRef.current = null;
          }, 0);
        };
      }

      const pro = new KLineChartPro({
        container: containerRef.current as HTMLElement,
        symbol: props.symbol,
        period: props.period,
        periods: props.periods ?? NATIVE_PERIODS,
        datafeed: props.datafeed,
        theme: props.theme ?? "dark",
        locale: props.locale ?? "zh-CN",
        timezone: "Asia/Shanghai",
        watermark: props.watermarkText ?? "",
        drawingBarVisible: true,
        mainIndicators: ["MA"],
        subIndicators: ["VOL"],
        onSymbolChange: (s) => propsRef.current.onSymbolChange?.(s),
        onPeriodChange: (p) => propsRef.current.onPeriodChange?.(p),
        pinnedTimeframes: loadPinnedTimeframes(),
        onPinChange: (ids) => savePinnedTimeframes(ids),
        styles: {
          grid: { horizontal: { color: "#2a2e39" }, vertical: { color: "#2a2e39" } },
          candle: {
            bar: {
              upColor: "#089981",
              downColor: "#f23645",
              noChangeColor: "#787b86",
              upBorderColor: "#089981",
              downBorderColor: "#f23645",
              noChangeBorderColor: "#787b86",
            },
            priceMark: {
              last: {
                show: true,
                upColor: "#089981",
                downColor: "#f23645",
                noChangeColor: "#787b86",
                line: { show: true, style: "dashed" as import("klinecharts").LineType, dashedValue: [4, 4] },
                text: { show: true, color: "#d1d4dc", size: 11, family: FONT_FAMILY_STACK },
              },
            },
          },
          xAxis: { size: 28, tickText: { size: 11, family: FONT_FAMILY_STACK }, axisLine: { color: "#2a2e39" } },
          yAxis: { size: "auto", tickText: { size: 11, family: FONT_FAMILY_STACK }, axisLine: { color: "#2a2e39" } },
          crosshair: {
            horizontal: {
              line: { color: "#9598a1", style: "dashed" as import("klinecharts").LineType, dashedValue: [4, 4] },
              text: {
                show: true,
                backgroundColor: "#131722",
                borderColor: "#2a2e39",
                color: "#d1d4dc",
                size: 11,
                family: FONT_FAMILY_STACK,
              },
            },
            vertical: {
              line: { color: "#9598a1", style: "dashed" as import("klinecharts").LineType, dashedValue: [4, 4] },
              text: {
                show: true,
                backgroundColor: "#131722",
                borderColor: "#2a2e39",
                color: "#d1d4dc",
                size: 11,
                family: FONT_FAMILY_STACK,
              },
            },
          },
        },
      });
      proRef.current = pro;
      mountedRef.current = true;
      props.onReady?.((pro.getChart() ?? null) as Chart | null);

      // Canvas text figures are rasterized once at draw time and do not
      // re-resolve after a webfont finishes downloading the way DOM text does
      // (font-display: swap). Wait for self-hosted fonts to be ready, then
      // force a relayout+redraw so axis/crosshair/price labels render with the
      // final Google Sans Flex / Noto Sans SC instead of the fallback glyphs.
      if (typeof document !== "undefined" && "fonts" in document) {
        document.fonts.ready
          .then(() => pro.getChart()?.resize())
          .catch(() => undefined);
      }
      return () => {
        // Schedule the real disposal a tick later: React StrictMode (dev)
        // immediately remounts the component after cleanup, in which case the
        // pending timer is cancelled by the new mount and the existing chart is
        // reused. A genuine unmount lets the timer fire and release everything.
        disposeTimerRef.current = setTimeout(() => {
          propsRef.current.datafeed.unsubscribe(
            propsRef.current.symbol,
            propsRef.current.period,
          );
          if (containerRef.current) containerRef.current.innerHTML = "";
          proRef.current = null;
          mountedRef.current = false;
          disposeTimerRef.current = null;
        }, 0);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      setSymbol: (symbol) => proRef.current?.setSymbol(symbol),
      setPeriod: (period) => proRef.current?.setPeriod(period),
      setTheme: (theme) => proRef.current?.setTheme(theme),
      setLocale: (locale) => proRef.current?.setLocale(locale),
      getChart: () => (proRef.current?.getChart() ?? null) as Chart | null,
      getRoot: () => containerRef.current,
    }));

    // Follow global theme/locale changes without remounting.
    useEffect(() => {
      proRef.current?.setTheme(props.theme ?? "dark");
    }, [props.theme]);
    useEffect(() => {
      if (props.locale) proRef.current?.setLocale(props.locale);
    }, [props.locale]);

    // Symbol / period are driven imperatively by the shell (watchlist,
    // command palette) — the pro instance reloads data via the datafeed.
    // Guard against re-applying a value the pro already holds (native search
    // and the period bar switch themselves before onSymbolChange fires).
    useEffect(() => {
      const cur = proRef.current?.getSymbol();
      if (cur && cur.ticker === props.symbol.ticker && (cur.market ?? null) === (props.symbol.market ?? null)) return;
      proRef.current?.setSymbol(props.symbol);
    }, [props.symbol]);
    useEffect(() => {
      const cur = proRef.current?.getPeriod();
      if (cur && cur.text === props.period.text && cur.multiplier === props.period.multiplier) return;
      proRef.current?.setPeriod(props.period);
    }, [props.period]);

    return <div ref={containerRef} className="w-full h-full min-h-0" />;
  },
);
