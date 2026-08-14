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

export interface KLineChartProHandle {
  setSymbol(symbol: SymbolInfo): void;
  setPeriod(period: Period): void;
  getChart(): Chart | null;
}

interface Props {
  symbol: SymbolInfo;
  period: Period;
  periods?: Period[];
  datafeed: Datafeed;
  theme?: string;
  drawingBarVisible?: boolean;
  mainIndicators?: string[];
  subIndicators?: string[];
  onSymbolChange?: (symbol: SymbolInfo) => void;
  onPeriodChange?: (period: Period) => void;
  onReady?: (chart: Chart | null) => void;
}

export const KLineChartProView = forwardRef<KLineChartProHandle, Props>(
  function KLineChartProView(props, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const proRef = useRef<ChartPro | null>(null);

    useEffect(() => {
      const pro = new KLineChartPro({
        container: containerRef.current as HTMLElement,
        symbol: props.symbol,
        period: props.period,
        periods: props.periods,
        datafeed: props.datafeed,
        theme: props.theme ?? "dark",
        watermark: "",
        drawingBarVisible: props.drawingBarVisible ?? true,
        mainIndicators: props.mainIndicators ?? ["MA"],
        subIndicators: props.subIndicators ?? ["VOL"],
        onSymbolChange: props.onSymbolChange,
        onPeriodChange: props.onPeriodChange,
        styles: {
          grid: { horizontal: { color: "#161b22" }, vertical: { color: "#161b22" } },
          candle: {
            bar: { upColor: "#16c784", downColor: "#ea3943", noChangeColor: "#848e9c" },
          },
          xAxis: { axisLine: { color: "#232a33" } },
          yAxis: { axisLine: { color: "#232a33" } },
        },
      });
      proRef.current = pro;
      props.onReady?.((pro.getChart() ?? null) as Chart | null);
      return () => {
        // Pro class does not expose a dispose(); clear the mounted tree.
        if (containerRef.current) containerRef.current.innerHTML = "";
        proRef.current = null;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      setSymbol: (symbol) => proRef.current?.setSymbol(symbol),
      setPeriod: (period) => proRef.current?.setPeriod(period),
      getChart: () => (proRef.current?.getChart() ?? null) as Chart | null,
    }));

    return <div ref={containerRef} className="w-full h-full min-h-0" />;
  },
);
