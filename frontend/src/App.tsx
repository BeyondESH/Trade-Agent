import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Period, SymbolInfo } from "@klinecharts/pro";
import { BitgetDatafeed, FIXED_SYMBOLS, periodToTimeframe } from "./api/datafeed";
import { api } from "./api/client";
import type { AnalyzeResponse, Candle, StructureResponse } from "./api/types";
import { AnalysisPanel } from "./components/ai/AnalysisPanel";
import { KLineChartProView, type KLineChartProHandle } from "./components/chart/KLineChartProView";
import { AutoLayerController } from "./lib/chartController";
import {
  boxToRect,
  candlesToKLineData,
  levelsToPriceLines,
  priceLineToOverlay,
  trendlineToSegment,
} from "./lib/transform";
import { Badge, Button, Input, Panel } from "./ui";

const DEFAULT_SYMBOL: SymbolInfo = { ...FIXED_SYMBOLS[0] };
const DEFAULT_PERIOD: Period = { multiplier: 5, timespan: "minute", text: "5m" };
const PERIODS: Period[] = [
  { multiplier: 1, timespan: "minute", text: "1m" },
  { multiplier: 5, timespan: "minute", text: "5m" },
  { multiplier: 15, timespan: "minute", text: "15m" },
  { multiplier: 30, timespan: "minute", text: "30m" },
  { multiplier: 1, timespan: "hour", text: "1H" },
  { multiplier: 4, timespan: "hour", text: "4H" },
  { multiplier: 12, timespan: "hour", text: "12H" },
  { multiplier: 1, timespan: "day", text: "1D" },
];

const controller = new AutoLayerController();

export default function App() {
  const [symbol, setSymbol] = useState<SymbolInfo>(DEFAULT_SYMBOL);
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [analyze, setAnalyze] = useState<AnalyzeResponse | null>(null);
  const [structure, setStructure] = useState<StructureResponse | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [layers, setLayers] = useState({ sr: true, structure: true, smc: false });
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("market");
  const chartRef = useRef<KLineChartProHandle>(null);
  const datafeed = useMemo(() => new BitgetDatafeed(), []);

  const timeframe = periodToTimeframe(period);
  const seriesKey = `${symbol.ticker}/${timeframe}`;

  useEffect(() => {
    let alive = true;
    const series = { category: symbol.market ?? "USDT-FUTURES", symbol: symbol.ticker, timeframe };
    api
      .candles(series)
      .then((r) => alive && setCandles(r.count > 0 ? r.candles : []))
      .catch(() => alive && setCandles([]));
    api
      .analyze(series)
      .then((a) => alive && setAnalyze(a))
      .catch(() => alive && setAnalyze(null));
    api
      .structure(series)
      .then((s) => alive && setStructure(s))
      .catch(() => alive && setStructure(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey]);

  const applyAutoLayers = useCallback(() => {
    controller.removeOverlaysByGroup("auto-sr");
    controller.removeOverlaysByGroup("auto-structure");
    controller.removeOverlaysByGroup("auto-smc");
    if (layers.sr && analyze) {
      for (const pl of levelsToPriceLines(analyze.levels)) {
        controller.createOverlay({ ...priceLineToOverlay(pl), groupId: "auto-sr" });
      }
    }
    if (layers.structure && structure) {
      const t0 = candles[0]?.open_time ?? 0;
      const t1 = candles[candles.length - 1]?.open_time ?? 0;
      for (const tl of structure.trendlines) {
        controller.createOverlay({ ...trendlineToSegment(tl, t0, t1), groupId: "auto-structure" });
      }
      if (structure.box) {
        controller.createOverlay({ ...boxToRect(structure.box, t0, t1), groupId: "auto-structure" });
      }
    }
    if (layers.smc && structure) {
      for (const liq of structure.liquidity) {
        const price = (liq as { price?: number }).price;
        if (typeof price === "number") {
          controller.createOverlay({ name: "priceLine", points: [{ value: price }], groupId: "auto-smc" });
        }
      }
    }
  }, [analyze, structure, candles, layers]);

  const handleChartReady = useCallback(() => {
    controller.attach(chartRef.current?.getChart() ?? null);
    if (candles.length) controller.applyData(candlesToKLineData(candles));
    applyAutoLayers();
  }, [candles, applyAutoLayers]);

  useEffect(() => {
    applyAutoLayers();
  }, [applyAutoLayers]);

  const filteredSymbols = useMemo(() => {
    const q = search.toLowerCase();
    return FIXED_SYMBOLS.filter((s) => !q || s.ticker.toLowerCase().includes(q));
  }, [search]);

  const price = candles.length ? candles[candles.length - 1].close : undefined;
  const change = candles.length >= 2
    ? ((candles[candles.length - 1].close - candles[0].open) / candles[0].open) * 100
    : undefined;
  const up = (change ?? 0) >= 0;

  return (
    <div className="h-screen flex flex-col bg-base text-text">
      <header className="h-12 shrink-0 border-b border-border bg-panel flex items-center gap-4 px-4">
        <span className="font-bold text-accent">◆ AI-Trade</span>
        <span className="font-semibold">{symbol.ticker}</span>
        <span className="tnum text-base" style={{ color: up ? "#16c784" : "#ea3943" }}>
          {price != null ? price.toFixed(2) : "--"}
        </span>
        {change !== undefined && (
          <span className="tnum text-xs" style={{ color: up ? "#16c784" : "#ea3943" }}>
            {up ? "+" : ""}
            {change.toFixed(2)}%
          </span>
        )}
        <div className="ml-auto">
          <Button variant="primary" onClick={() => chartRef.current?.setPeriod(DEFAULT_PERIOD)}>
            ↻
          </Button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[220px_1fr_320px] min-h-0">
        <div className="hidden md:block min-h-0 overflow-auto">
          <Panel title="Markets" className="rounded-none border-0 border-r">
            <Input placeholder="search…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2" />
            <div className="flex flex-col gap-0.5">
              {filteredSymbols.map((s) => (
                <button
                  key={s.ticker}
                  onClick={() => {
                    setSymbol({ ...s });
                    chartRef.current?.setSymbol({ ...s });
                  }}
                  className={`flex items-center justify-between px-2 py-1.5 rounded text-xs ${
                    symbol.ticker === s.ticker ? "bg-panel2 text-text" : "text-muted hover:bg-panel2/50"
                  }`}
                >
                  <span className="font-semibold">{s.ticker}</span>
                  <span className="tnum text-[10px]">perp</span>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <div className="min-h-0 overflow-hidden">
          <KLineChartProView
            ref={chartRef}
            symbol={symbol}
            period={period}
            periods={PERIODS}
            datafeed={datafeed}
            theme="dark"
            onSymbolChange={(s) => setSymbol({ ...s })}
            onPeriodChange={(p) => setPeriod({ ...p })}
            onReady={handleChartReady}
          />
          <div className="flex items-center gap-3 px-2 py-1 border-t border-border text-[10px] text-muted">
            {(
              [
                ["sr", "S/R"],
                ["structure", "structure"],
                ["smc", "SMC"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={layers[key]}
                  onChange={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="hidden md:block min-h-0 overflow-auto">
          <AnalysisPanel symbol={symbol.ticker} timeframe={timeframe} />
        </div>
      </div>
    </div>
  );
}
