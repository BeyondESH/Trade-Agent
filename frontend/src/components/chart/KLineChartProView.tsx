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

export interface KLineChartProHandle {
  setSymbol(symbol: SymbolInfo): void;
  setPeriod(period: Period): void;
  setTheme(theme: string): void;
  setLocale(locale: string): void;
  getChart(): Chart | null;
  getRoot(): HTMLElement | null;
}

/** Period list aligned with backend-supported granularities. */
export const NATIVE_PERIODS: Period[] = [
  { multiplier: 1, timespan: "minute", text: "1m" },
  { multiplier: 5, timespan: "minute", text: "5m" },
  { multiplier: 15, timespan: "minute", text: "15m" },
  { multiplier: 30, timespan: "minute", text: "30m" },
  { multiplier: 1, timespan: "hour", text: "1h" },
  { multiplier: 4, timespan: "hour", text: "4h" },
  { multiplier: 12, timespan: "hour", text: "12h" },
  { multiplier: 1, timespan: "day", text: "1d" },
];

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

    useEffect(() => {
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
                text: { show: true, color: "#d1d4dc", size: 11 },
              },
            },
          },
          xAxis: { size: 28, tickText: { size: 11 }, axisLine: { color: "#2a2e39" } },
          yAxis: { size: "auto", tickText: { size: 11 }, axisLine: { color: "#2a2e39" } },
          crosshair: {
            horizontal: {
              line: { color: "#9598a1", style: "dashed" as import("klinecharts").LineType, dashedValue: [4, 4] },
              text: {
                show: true,
                backgroundColor: "#131722",
                borderColor: "#2a2e39",
                color: "#d1d4dc",
                size: 11,
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
              },
            },
          },
        },
      });
      proRef.current = pro;
      props.onReady?.((pro.getChart() ?? null) as Chart | null);
      return () => {
        // Pro has no dispose(); clear the mounted tree and release the
        // datafeed subscription so listeners don't leak.
        props.datafeed.unsubscribe(props.symbol, props.period);
        if (containerRef.current) containerRef.current.innerHTML = "";
        proRef.current = null;
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
