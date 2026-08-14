import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Period, SymbolInfo } from "@klinecharts/pro";
import { BitgetDatafeed, FIXED_SYMBOLS, periodToTimeframe } from "./api/datafeed";
import { api } from "./api/client";
import type { AnalyzeResponse, Candle, StructureResponse } from "./api/types";
import { AiAnalysisPlaceholder } from "./components/ai/AiAnalysisPlaceholder";
import { KLineChartProView, type KLineChartProHandle } from "./components/chart/KLineChartProView";
import { FundingRate, MarkPrice } from "./components/derivative/FundingRate";
import { TickerBar } from "./components/market/TickerBar";
import { MarketList } from "./components/market/MarketList";
import { OrderBook } from "./components/orderbook/OrderBook";
import { TradesTape } from "./components/orderbook/TradesTape";
import { useDerivative } from "./hooks/useDerivative";
import { useOrderBook } from "./hooks/useOrderBook";
import { useTickerList } from "./hooks/useTickerList";
import { useTrades } from "./hooks/useTrades";
import { AutoLayerController } from "./lib/chartController";
import { GridStackLayout } from "./lib/gridStackLayout";
import {
  boxToRect,
  candlesToKLineData,
  levelsToPriceLines,
  priceLineToOverlay,
  trendlineToSegment,
} from "./lib/transform";

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

const PANEL_IDS = ["market-list", "chart", "right-panel", "ai-panel"] as const;

const controller = new AutoLayerController();

function toSymbolInfo(ticker: string): SymbolInfo {
  const known = FIXED_SYMBOLS.find((s) => s.ticker === ticker);
  return known
    ? { ...known }
    : { ticker, shortName: ticker, market: "USDT-FUTURES", pricePrecision: 2, volumePrecision: 4 };
}

function PanelFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <div className="panel-header flex h-8 shrink-0 cursor-move select-none items-center gap-2 border-b border-border bg-panel2 px-2.5 text-sm font-semibold text-text">
        <span className="text-accent">≡</span>
        <span className="tracking-wide">{title}</span>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export default function App() {
  const [symbol, setSymbol] = useState<SymbolInfo>(DEFAULT_SYMBOL);
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [analyze, setAnalyze] = useState<AnalyzeResponse | null>(null);
  const [structure, setStructure] = useState<StructureResponse | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [layers, setLayers] = useState({ sr: true, structure: true, smc: false });
  const chartRef = useRef<KLineChartProHandle>(null);
  const datafeed = useMemo(() => new BitgetDatafeed(), []);

  const tickerList = useTickerList();
  const orderBook = useOrderBook(symbol.ticker);
  const trades = useTrades(symbol.ticker);
  const derivative = useDerivative(symbol.ticker);

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

  const handlePanelResize = useCallback((id: string) => {
    if (id === "chart") chartRef.current?.getChart()?.resize();
  }, []);

  const handlePanelMove = useCallback(() => {
    chartRef.current?.getChart()?.resize();
  }, []);

  const price = candles.length ? candles[candles.length - 1].close : undefined;
  const change = candles.length >= 2
    ? ((candles[candles.length - 1].close - candles[0].open) / candles[0].open) * 100
    : undefined;
  const up = (change ?? 0) >= 0;

  const handleSelect = useCallback((ticker: string) => {
    setSymbol(toSymbolInfo(ticker));
    chartRef.current?.setSymbol(toSymbolInfo(ticker));
  }, []);

  const renderPanel = useCallback(
    (id: string): ReactNode => {
      switch (id) {
        case "market-list":
          return (
            <PanelFrame title="市场">
              <MarketList
                tickers={tickerList.tickers}
                search={tickerList.search}
                sortKey={tickerList.sortKey}
                sortDir={tickerList.sortDir}
                active={symbol.ticker}
                onSearch={tickerList.setSearch}
                onSort={tickerList.setSort}
                onSelect={handleSelect}
              />
            </PanelFrame>
          );
        case "chart":
          return (
            <PanelFrame title={`图表 · ${symbol.ticker} ${period.text}`}>
              <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1">
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
                </div>
                <div className="flex items-center gap-3 border-t border-border px-2 py-1 text-xs text-muted">
                  {(
                    [
                      ["sr", "S/R"],
                      ["structure", "structure"],
                      ["smc", "SMC"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-1 font-medium">
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
            </PanelFrame>
          );
        case "right-panel":
          return (
            <PanelFrame title="订单簿 / 成交">
              <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1">
                  <OrderBook asks={orderBook.asks} bids={orderBook.bids} spread={orderBook.spread} precision={2} />
                </div>
                <div className="min-h-0 flex-1 border-t border-border">
                  <TradesTape trades={trades} precision={2} />
                </div>
                <div className="flex items-center justify-between border-t border-border px-2 py-1">
                  <FundingRate funding={derivative.funding} />
                  <MarkPrice markPrice={derivative.markPrice} />
                </div>
              </div>
            </PanelFrame>
          );
        case "ai-panel":
          return (
            <PanelFrame title="AI 分析">
              <AiAnalysisPlaceholder />
            </PanelFrame>
          );
        default:
          return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tickerList, symbol, period, candles, orderBook, trades, derivative, layers, handleSelect, handleChartReady],
  );

  return (
    <div className="flex h-screen flex-col bg-base text-text">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-panel px-4">
        <span className="text-base font-bold text-accent">RaiBro Trading</span>
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
        <span className="ml-auto text-xs text-muted">USDT-FUTURES</span>
      </header>

      <TickerBar tickers={tickerList.tickers.slice(0, 40)} active={symbol.ticker} onSelect={handleSelect} />

      <div className="min-h-0 flex-1">
        <GridStackLayout
          panelIds={[...PANEL_IDS]}
          onPanelResize={handlePanelResize}
          onPanelMove={handlePanelMove}
        >
          {renderPanel}
        </GridStackLayout>
      </div>
    </div>
  );
}
