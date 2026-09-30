import {
  type ChartPro,
  type Datafeed,
  KLineChartPro,
  type Period,
  type SymbolInfo,
} from "@klinecharts/pro";
import type { Chart } from "klinecharts";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import "../../../vendor/klinecharts-pro/dist/klinecharts-pro.css";
import "../../klinecharts-pro-theme.css";
import { FONT_FAMILY_STACK } from "../../lib/fonts";
import { loadPinnedTimeframes, savePinnedTimeframes } from "../../lib/periodsStore";

export interface KLineChartProHandle {
  setSymbol(symbol: SymbolInfo): void;
  setPeriod(period: Period): void;
  setTheme(theme: string): void;
  setLocale(locale: string): void;
  getChart(): Chart | null;
  getRoot(): HTMLElement | null;
  /** Open the pro native indicator picker (bridges the period-bar chrome button). */
  openIndicatorPicker(): void;
  /** Open the pro native settings modal (bridges the period-bar chrome button). */
  openSettings(): void;
  /** Re-anchor the viewport to the latest candle (default zoom). */
  resetView(): void;
}

/**
 * Native period-bar tool buttons, in render order (`PeriodBar`):
 * indicator, timezone, setting, screenshot, fullscreen. The pro instance is
 * built from Solid and exposes none of the modal openers on `ChartPro`, so the
 * only viable entry point is to click its own chrome button.
 */
const NATIVE_TOOL_INDEX = { indicator: 0, settings: 2 } as const;

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
export const PERIOD_GROUPS: {
  unit: string;
  label: string;
  periods: Period[];
}[] = [
  { unit: "second", label: "秒", periods: [] },
  { unit: "minute", label: "分钟", periods: [] },
  { unit: "hour", label: "小时", periods: [] },
  { unit: "day", label: "天", periods: [] },
  { unit: "week", label: "周/月", periods: [] },
];
export function groupPeriods(periods: Period[]) {
  const grouped = PERIOD_GROUPS.map((g) => ({ ...g, periods: [] as Period[] }));
  for (const p of periods) {
    const g = grouped.find(
      (x) =>
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
            propsRef.current.datafeed.unsubscribe(propsRef.current.symbol, propsRef.current.period);
            if (containerRef.current) containerRef.current.innerHTML = "";
            proRef.current = null;
            mountedRef.current = false;
            disposeTimerRef.current = null;
          }, 0);
        };
      }

      // Canvas palette — klinecharts takes concrete colour strings (it cannot
      // read CSS custom properties), so this is the ONE legitimate JS theme
      // branch. These values mirror the --ta-* tokens in src/index.css.
      const dark = (props.theme ?? "dark") !== "light";
      const gridLine = dark ? "#1d2e35" : "#dce5e8";
      const upColor = dark ? "#22b98c" : "#0b7a59";
      const downColor = dark ? "#ef5a5f" : "#c63439";
      const noChangeColor = dark ? "#798f98" : "#5f7078";
      const textColor = dark ? "#e7eef1" : "#0b171c";
      const crosshairLine = "#7e939b";
      const crosshairBg = dark ? "#0a1216" : "#ffffff";
      const crosshairBorder = dark ? "#1d2e35" : "#dce5e8";
      const canvasStyles = {
        grid: {
          horizontal: { color: gridLine },
          vertical: { color: gridLine },
        },
        candle: {
          bar: {
            upColor,
            downColor,
            noChangeColor,
            upBorderColor: upColor,
            downBorderColor: downColor,
            noChangeBorderColor: noChangeColor,
          },
          priceMark: {
            last: {
              show: true,
              upColor,
              downColor,
              noChangeColor,
              line: {
                show: true,
                style: "dashed" as import("klinecharts").LineType,
                dashedValue: [4, 4],
              },
              text: {
                show: true,
                color: textColor,
                size: 11,
                family: FONT_FAMILY_STACK,
              },
            },
          },
        },
        xAxis: {
          size: 28,
          tickText: { size: 11, color: textColor, family: FONT_FAMILY_STACK },
          axisLine: { color: gridLine },
        },
        yAxis: {
          size: "auto" as const,
          tickText: { size: 11, color: textColor, family: FONT_FAMILY_STACK },
          axisLine: { color: gridLine },
        },
        crosshair: {
          horizontal: {
            line: {
              color: crosshairLine,
              style: "dashed" as import("klinecharts").LineType,
              dashedValue: [4, 4],
            },
            text: {
              show: true,
              backgroundColor: crosshairBg,
              borderColor: crosshairBorder,
              color: textColor,
              size: 11,
              family: FONT_FAMILY_STACK,
            },
          },
          vertical: {
            line: {
              color: crosshairLine,
              style: "dashed" as import("klinecharts").LineType,
              dashedValue: [4, 4],
            },
            text: {
              show: true,
              backgroundColor: crosshairBg,
              borderColor: crosshairBorder,
              color: textColor,
              size: 11,
              family: FONT_FAMILY_STACK,
            },
          },
        },
      };

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
        styles: canvasStyles,
      });
      proRef.current = pro;
      mountedRef.current = true;
      const chart = (pro.getChart() ?? null) as Chart | null;
      // Read-only diagnostic handle for end-to-end (Playwright) assertions.
      // Exposes the live chart's public data list; does not change rendering.
      if (typeof window !== "undefined") {
        (window as unknown as { __kline_chart__?: Chart | null }).__kline_chart__ = chart;
      }
      props.onReady?.(chart);

      return () => {
        // Schedule the real disposal a tick later: React StrictMode (dev)
        // immediately remounts the component after cleanup, in which case the
        // pending timer is cancelled by the new mount and the existing chart is
        // reused. A genuine unmount lets the timer fire and release everything.
        disposeTimerRef.current = setTimeout(() => {
          propsRef.current.datafeed.unsubscribe(propsRef.current.symbol, propsRef.current.period);
          if (containerRef.current) containerRef.current.innerHTML = "";
          proRef.current = null;
          mountedRef.current = false;
          disposeTimerRef.current = null;
        }, 0);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Canvas text figures are rasterized once at draw time and do not re-resolve
    // after a webfont lands the way DOM text does under font-display: swap.
    // The @font-face block now loads off the critical path (src/fonts.css), so
    // `document.fonts.ready` can resolve before the faces are even declared —
    // therefore also listen for `loadingdone` so axis/crosshair/price labels are
    // redrawn with the final Google Sans Flex / Noto Sans SC, never left in the
    // fallback glyphs.
    useEffect(() => {
      if (typeof document === "undefined" || !("fonts" in document)) return;
      const faces = document.fonts;
      const redraw = () => proRef.current?.getChart()?.resize();
      faces.ready.then(redraw).catch(() => undefined);
      faces.addEventListener?.("loadingdone", redraw);
      return () => faces.removeEventListener?.("loadingdone", redraw);
    }, []);

    // Keep the canvases in step with the CONTAINER. The chart lives in a flex
    // row whose width changes without a window resize: the right dock reserves
    // (open), releases (close) or drag-resizes its space. The vendor only
    // re-measures on `window.resize`, so observe the container instead and
    // re-measure at most once per animation frame, skipping no-op sizes — the
    // canvas ends at exactly one committed width, at the frame new layout is
    // painted.
    useEffect(() => {
      const el = containerRef.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      let frame: number | null = null;
      let lastW = el.clientWidth;
      let lastH = el.clientHeight;
      const resizeNow = () => {
        frame = null;
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (w === 0 || h === 0 || (w === lastW && h === lastH)) return;
        lastW = w;
        lastH = h;
        proRef.current?.getChart()?.resize();
      };
      const observer = new ResizeObserver(() => {
        if (frame == null) frame = requestAnimationFrame(resizeNow);
      });
      observer.observe(el);
      return () => {
        observer.disconnect();
        if (frame != null) cancelAnimationFrame(frame);
      };
    }, []);

    const clickNativeTool = (index: number) => {
      const root = containerRef.current;
      if (!root) return;
      const tools = root.querySelectorAll<HTMLElement>(".klinecharts-pro-period-bar .item.tools");
      tools[index]?.click();
    };

    useImperativeHandle(ref, () => ({
      setSymbol: (symbol) => proRef.current?.setSymbol(symbol),
      setPeriod: (period) => proRef.current?.setPeriod(period),
      setTheme: (theme) => proRef.current?.setTheme(theme),
      setLocale: (locale) => proRef.current?.setLocale(locale),
      getChart: () => (proRef.current?.getChart() ?? null) as Chart | null,
      getRoot: () => containerRef.current,
      openIndicatorPicker: () => clickNativeTool(NATIVE_TOOL_INDEX.indicator),
      openSettings: () => clickNativeTool(NATIVE_TOOL_INDEX.settings),
      resetView: () => proRef.current?.getChart()?.scrollToRealTime(),
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
      if (
        cur &&
        cur.ticker === props.symbol.ticker &&
        (cur.market ?? null) === (props.symbol.market ?? null)
      )
        return;
      proRef.current?.setSymbol(props.symbol);
    }, [props.symbol]);
    useEffect(() => {
      const cur = proRef.current?.getPeriod();
      if (cur && cur.text === props.period.text && cur.multiplier === props.period.multiplier)
        return;
      proRef.current?.setPeriod(props.period);
    }, [props.period]);

    return <div ref={containerRef} className="w-full h-full min-h-0" />;
  },
);
