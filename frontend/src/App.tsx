import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chart, Indicator } from "klinecharts";
import { CandleType } from "klinecharts";
import type { Period, SymbolInfo } from "@klinecharts/pro";
import { BitgetDatafeed, periodFromTimeframe, periodToTimeframe, resolveSymbolInfo } from "./api/datafeed";
import type { ConnStatus } from "./api/ws";
import { api } from "./api/client";
import type { AnalyzeResponse, Candle, ChartConfig, StructureResponse } from "./api/types";
import { ChartGrid, type CellState } from "./components/chart/ChartGrid";
import { ChartAxisControls } from "./components/chart/ChartAxisControls";
import { ChartContextMenu } from "./components/chart/ChartContextMenu";
import { ChartFloatingToolbar } from "./components/chart/ChartFloatingToolbar";
import { ChartLegend } from "./components/chart/ChartLegend";
import { ReplayBar } from "./components/chart/ReplayBar";
import type { KLineChartProHandle } from "./components/chart/KLineChartProView";
import { AlertsPanel } from "./components/panels/AlertsPanel";
import { AiDockPanel } from "./components/panels/AiDockPanel";
import { BacktestPanel } from "./components/panels/BacktestPanel";
import { BrokerPanel } from "./components/panels/BrokerPanel";
import { DataWindowPanel } from "./components/panels/DataWindowPanel";
import { DomPanel } from "./components/panels/DomPanel";
import { ScreenerPanel } from "./components/panels/ScreenerPanel";
import { WatchlistPanel } from "./components/panels/WatchlistPanel";
import { TVBottomDock, type DockTabDef, type DockTabId } from "./layout/TVBottomDock";
import { SearchModal } from "./layout/SearchModal";
import {
  TVRightSidebar,
  rightTabIcons,
  type RightTabDef,
  type RightTabId,
} from "./layout/TVRightSidebar";
import { TVStatusBar } from "./layout/TVStatusBar";
import { TVTopBar } from "./layout/TVTopBar";
import { useDerivative } from "./hooks/useDerivative";
import { useOrderBook } from "./hooks/useOrderBook";
import { useTickerList } from "./hooks/useTickerList";
import { useTrades } from "./hooks/useTrades";
import { AutoLayerController } from "./lib/chartController";
import {
  boxToRect,
  candlesToKLineData,
  levelsToPriceLines,
  priceLineToOverlay,
  trendlineToSegment,
} from "./lib/transform";
import { ReplayEngine, type ReplaySpeed } from "./lib/replayEngine";
import { PaperAccount } from "./lib/paperAccount";
import { useI18n, type Locale } from "./lib/i18n";
import { useTheme, type Theme } from "./lib/theme";
import * as bridge from "./lib/chartChromeBridge";
import { restoreDrawings, saveDrawings } from "./lib/drawingPersistence";
import { chartSyncBus, DEFAULT_SYNC_FLAGS, type DrawSyncPayload, type SyncFlags, type SyncKind } from "./lib/chartSyncBus";
import {
  DrawSyncRegistry,
  applyRemoteCrosshair,
  applyRemoteDraw,
  applyRemoteRange,
  guarded,
  type SuppressRef,
} from "./lib/chartSyncActions";
import { setupCellChart } from "./lib/cellChartSetup";
import {
  loadAlerts,
  mirrorAlertUpdate,
  saveAlerts,
  subscribeAlerts,
  type Alert,
} from "./lib/alertsStore";
import { ToastStack, type ToastItem } from "./ui/Toast";

const DEFAULT_SYMBOL: SymbolInfo = {
  ticker: "BTCUSDT",
  shortName: "BTCUSDT",
  market: "USDT-FUTURES",
  pricePrecision: 1,
  volumePrecision: 4,
};
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

const TAB_LABELS: Record<RightTabId, RightTabDef["labelKey"]> = {
  watchlist: "sidebar.watchlist",
  alerts: "alerts.title",
  datawindow: "dataWindow.title",
  dom: "sidebar.dom",
  broker: "sidebar.broker",
};

const RIGHT_TABS: RightTabDef[] = rightTabIcons().map((t) => ({ ...t, labelKey: TAB_LABELS[t.id] }));

const DOCK_TABS: DockTabDef[] = [
  { id: "ai", labelKey: "dock.ai" },
  { id: "backtest", labelKey: "dock.backtest" },
  { id: "screener", labelKey: "dock.screener" },
  { id: "broker", labelKey: "dock.broker" },
];

const controller = new AutoLayerController();

/** Split a `category:instId` composite symbol key into its parts. */
export function splitSymbolKey(composite: string): { category?: string; instId: string } {
  const idx = composite.indexOf(":");
  if (idx <= 0) return { instId: composite };
  return { category: composite.slice(0, idx), instId: composite.slice(idx + 1) };
}

function loadNum(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function loadSyncFlags(): SyncFlags {
  try {
    const raw = localStorage.getItem("raibro.syncflags");
    if (raw) return { ...DEFAULT_SYNC_FLAGS, ...(JSON.parse(raw) as Partial<SyncFlags>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SYNC_FLAGS };
}

function cellSeriesKey(cs: CellState): string {
  return `${cs.symbol.market ?? "USDT-FUTURES"}:${cs.symbol.ticker}:${periodToTimeframe(cs.period)}`;
}

function cellSymbolKey(cs: CellState): string {
  return `${cs.symbol.market ?? "USDT-FUTURES"}:${cs.symbol.ticker}`;
}

/** Enumerate the indicators currently attached to a chart (all panes). */
function collectCellIndicators(chart: Chart | null): { paneId: string; name: string }[] {
  if (!chart) return [];
  try {
    const panes = chart.getIndicatorByPaneId();
    const out: { paneId: string; name: string }[] = [];
    if (panes instanceof Map) {
      panes.forEach((v, paneId) => {
        if (v instanceof Map) v.forEach((_ind: Indicator, name: string) => out.push({ paneId, name }));
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Best-effort: add any persisted indicator that the chart is missing. */
function restoreCellIndicators(chart: Chart, wanted: Array<{ paneId: string; name: string }>): void {
  try {
    const panes = chart.getIndicatorByPaneId();
    const has = (paneId: string, name: string): boolean => {
      const m = panes instanceof Map ? panes.get(paneId) : undefined;
      return m instanceof Map && m.has(name);
    };
    for (const w of wanted) {
      if (has(w.paneId, w.name)) continue;
      if (w.paneId === "candle_pane") chart.createIndicator({ name: w.name }, true);
      else chart.createIndicator({ name: w.name }, false, { id: w.paneId });
    }
  } catch {
    /* indicator restore is best-effort */
  }
}

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();

  const [layoutCount, setLayoutCount] = useState(() => loadNum("raibro.layout", 1));
  const [cellStates, setCellStates] = useState<CellState[]>(() =>
    Array.from({ length: Math.max(1, loadNum("raibro.layout", 1)) }, () => ({
      symbol: DEFAULT_SYMBOL,
      period: DEFAULT_PERIOD,
    })),
  );
  const [activeCell, setActiveCell] = useState(0);
  const [syncFlags, setSyncFlags] = useState<SyncFlags>(loadSyncFlags);
  const [chartType, setChartType] = useState<CandleType>("candle_solid" as CandleType);
  const [analyze, setAnalyze] = useState<AnalyzeResponse | null>(null);
  const [structure, setStructure] = useState<StructureResponse | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [layers, setLayers] = useState({ sr: true, structure: true, smc: false });

  const [rightTab, setRightTab] = useState<RightTabId>("watchlist");
  const [rightOpen, setRightOpen] = useState(true);
  const [rightWidth, setRightWidth] = useState(() => loadNum("raibro.rightw", 300));
  const [dockTab, setDockTab] = useState<DockTabId>("ai");
  const [dockOpen, setDockOpen] = useState(false);
  const [dockHeight, setDockHeight] = useState(() => loadNum("raibro.dockh", 32));
  const [primaryChart, setPrimaryChart] = useState<Chart | null>(null);
  const [selectedOverlay, setSelectedOverlay] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; price?: number } | null>(null);
  const [awayFromLive, setAwayFromLive] = useState(false);
  const [alertPrefill, setAlertPrefill] = useState<{ symbol: string; threshold: number } | null>(null);
  const [connState, setConnState] = useState<ConnStatus>("live");
  const [searchOpen, setSearchOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [chartAlerts, setChartAlerts] = useState<Alert[]>(loadAlerts);

  const datafeed = useMemo(() => new BitgetDatafeed(), []);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const replayRef = useRef<ReplayEngine | null>(null);
  if (!replayRef.current) replayRef.current = new ReplayEngine();
  const paperRef = useRef<PaperAccount | null>(null);
  if (!paperRef.current) paperRef.current = new PaperAccount();
  const [, setReplayTick] = useState(0);

  // Per-cell registries (charts / imperative handles / sync state).
  const cellHandles = useRef<(KLineChartProHandle | null)[]>([]);
  const cellCharts = useRef<(Chart | null)[]>([]);
  const cellCleanups = useRef<Array<(() => void) | null>>([]);
  const suppressRefs = useRef<SuppressRef[]>([]);
  const drawRegistries = useRef<DrawSyncRegistry[]>([]);
  const overlayIds = useRef<Set<string>[]>([]);
  const busUnsubs = useRef<Array<(() => void) | null>>([]);
  /** Indicators loaded from the persisted grid layout, keyed by cell index. */
  const restoredIndicators = useRef<Array<{ paneId: string; name: string }[]>>([]);

  const activeCellRef = useRef(0);
  activeCellRef.current = activeCell;
  const cellStatesRef = useRef(cellStates);
  cellStatesRef.current = cellStates;

  const activeIdx = Math.min(activeCell, cellStates.length - 1);
  const { symbol, period } = cellStates[activeIdx] ?? { symbol: DEFAULT_SYMBOL, period: DEFAULT_PERIOD };

  const tickerList = useTickerList();
  const category = symbol.market ?? "USDT-FUTURES";
  const activeKey = `${category}:${symbol.ticker}`;
  const orderBook = useOrderBook(symbol.ticker, category);
  const trades = useTrades(symbol.ticker, category);
  const derivative = useDerivative(symbol.ticker, category);

  const timeframe = periodToTimeframe(period);
  const seriesKey = `${category}/${symbol.ticker}/${timeframe}`;

  const ensureSuppress = (i: number): SuppressRef =>
    suppressRefs.current[i] ?? (suppressRefs.current[i] = { current: 0 });
  const ensureRegistry = (i: number): DrawSyncRegistry =>
    drawRegistries.current[i] ?? (drawRegistries.current[i] = new DrawSyncRegistry());
  const ensureOverlayIds = (i: number): Set<string> =>
    overlayIds.current[i] ?? (overlayIds.current[i] = new Set());

  // ---------- persistence of UI preferences -------------------------------
  useEffect(() => {
    try {
      localStorage.setItem("raibro.layout", String(layoutCount));
    } catch {
      /* ignore */
    }
  }, [layoutCount]);
  useEffect(() => {
    try {
      localStorage.setItem("raibro.rightw", String(rightWidth));
    } catch {
      /* ignore */
    }
  }, [rightWidth]);
  useEffect(() => {
    try {
      localStorage.setItem("raibro.dockh", String(dockHeight));
    } catch {
      /* ignore */
    }
  }, [dockHeight]);
  useEffect(() => {
    chartSyncBus.setFlags(syncFlags);
    try {
      localStorage.setItem("raibro.syncflags", JSON.stringify(syncFlags));
    } catch {
      /* ignore */
    }
  }, [syncFlags]);

  useEffect(() => {
    datafeed.setConnStateListener(setConnState);
    return () => datafeed.setConnStateListener(undefined);
  }, [datafeed]);

  // ---------- alerts: change feed, chart lines, trigger toasts ------------
  const addToast = useCallback((text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((ts) => [...ts.slice(-4), { id, text }]);
    window.setTimeout(() => {
      setToasts((ts) => ts.filter((x) => x.id !== id));
    }, 6000);
  }, []);

  useEffect(() => subscribeAlerts(setChartAlerts), []);

  // Ask for browser notification permission once (best-effort).
  useEffect(() => {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch {
      /* notifications unavailable */
    }
  }, []);

  const handleAlertTrigger = useCallback(
    (alert: Alert) => {
      addToast(`${alert.symbol} ${alert.condition === "above" ? "≥" : "≤"} ${alert.threshold}`);
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("RaiBro Alert", {
            body: `${alert.symbol} ${alert.condition === "above" ? "≥" : "≤"} ${alert.threshold}`,
          });
        }
      } catch {
        /* notifications unavailable */
      }
    },
    [addToast],
  );

  const updateAlertThreshold = useCallback((id: string, threshold: number) => {
    const next = loadAlerts().map((x) => (x.id === id ? { ...x, threshold } : x));
    saveAlerts(next);
    mirrorAlertUpdate(id, { threshold });
  }, []);

  // Draw enabled, untriggered alerts for the active symbol as draggable price lines.
  useEffect(() => {
    if (!primaryChart) return;
    primaryChart.removeOverlay({ groupId: "alert-lines" });
    const active = chartAlerts.filter(
      (a) => a.enabled && !a.triggered && a.symbol.replace(/^[^:]*:/, "") === symbol.ticker,
    );
    for (const a of active) {
      primaryChart.createOverlay({
        name: "priceLine",
        points: [{ value: a.threshold }],
        groupId: "alert-lines",
        styles: {
          line: { color: "#2962ff", style: "dashed" as unknown as import("klinecharts").LineType },
        },
        onPressedMoveEnd: (event) => {
          const v = (event.overlay?.points?.[0] as { value?: number } | undefined)?.value;
          if (typeof v === "number" && Number.isFinite(v)) updateAlertThreshold(a.id, v);
          return false;
        },
      });
    }
  }, [primaryChart, chartAlerts, symbol.ticker, updateAlertThreshold]);

  // ---------- replay mode (bar replay + paper trading) ---------------------
  const replayEngine = replayRef.current;
  const replaySnap = replayEngine.snapshot;

  useEffect(() => {
    const engine = replayRef.current;
    if (!engine) return undefined;
    return engine.subscribe(() => {
      setReplayTick((x) => x + 1);
      const snap = engine.snapshot;
      const chart = cellCharts.current[0];
      if (snap.active && chart) {
        chart.applyNewData(candlesToKLineData(engine.slice()), false);
      }
    });
  }, []);

  const enterReplay = useCallback(async () => {
    const engine = replayRef.current;
    if (!engine || engine.snapshot.active) return;
    if (activeIdx !== 0) {
      setActiveCell(0);
      setSelectedOverlay(null);
      setPrimaryChart(cellCharts.current[0] ?? null);
    }
    const series = { category, symbol: symbol.ticker, timeframe };
    try {
      const r = await api.candles(series, undefined, undefined, 1000);
      if (r.count < 40) return;
      const chart = cellCharts.current[0];
      if (!chart) return;
      datafeed.suspendUpdates(true);
      engine.load(r.candles, Math.max(30, r.candles.length - 240));
      chart.applyNewData(candlesToKLineData(engine.slice()), false);
    } catch {
      /* insufficient history or fetch failure: stay live */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, category, symbol.ticker, timeframe, datafeed]);

  const exitReplay = useCallback(() => {
    const engine = replayRef.current;
    const paper = paperRef.current;
    if (!engine || !paper || !engine.snapshot.active) return;
    const last = engine.last;
    if (last) paper.closeAll(last.close);
    const sum = paper.summary;
    if (sum.trades > 0) {
      addToast(
        `${t("replay.summary")} · ${t("replay.realized")} ${sum.realized.toFixed(2)} · ${sum.trades} · ${Math.round(sum.winRate * 100)}%`,
      );
    }
    engine.exit();
    paper.reset();
    datafeed.suspendUpdates(false);
    cellCharts.current[0]?.scrollToRealTime();
    setReplayTick((x) => x + 1);
  }, [datafeed, addToast, t]);

  const replayPlayToggle = useCallback(() => {
    const e = replayRef.current;
    if (!e) return;
    if (e.snapshot.playing) e.pause();
    else e.play();
  }, []);
  const replayStep = useCallback(() => replayRef.current?.step(), []);
  const replaySpeed = useCallback((s: ReplaySpeed) => replayRef.current?.setSpeed(s), []);
  const replaySeek = useCallback((cursor: number) => replayRef.current?.seek(cursor), []);
  const replayOrder = useCallback((side: "long" | "short", qty: number) => {
    const engine = replayRef.current;
    const paper = paperRef.current;
    const last = engine?.last;
    if (!engine || !paper || !last || !engine.snapshot.active) return;
    paper.open(side, qty, last.close);
    setReplayTick((x) => x + 1);
  }, []);
  const replayCloseAll = useCallback(() => {
    const engine = replayRef.current;
    const paper = paperRef.current;
    const last = engine?.last;
    if (!engine || !paper || !last || !engine.snapshot.active) return;
    paper.closeAll(last.close);
    setReplayTick((x) => x + 1);
  }, []);

  // ---------- active-series market data (panels & auto layers) ------------
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

  useEffect(() => () => controller.detach(), []);

  // ---------- cell state transitions (with drawing persistence) ----------
  const updateCell = useCallback((i: number, patch: Partial<CellState>) => {
    setCellStates((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }, []);

  /**
   * Commit a symbol change for cell i: persist drawings of the previous
   * series, clear overlays on the chart, restore the drawings of the new
   * series, update cell state and (optionally) broadcast to other cells.
   * When `applyHandle` is true the imperative setSymbol is invoked too (for
   * top-bar / sync-driven changes; the cell's own UI changes already applied).
   */
  const commitCellSymbol = useCallback(
    (i: number, info: SymbolInfo, opts: { emit: boolean; applyHandle: boolean }) => {
      const prev = cellStatesRef.current[i];
      if (!prev) return;
      const chart = cellCharts.current[i];
      const next: CellState = { ...prev, symbol: info };
      if (chart) {
        guarded(ensureSuppress(i), () => {
          saveDrawings(chart, cellSeriesKey(prev), [...ensureOverlayIds(i)]);
          chart.removeOverlay();
          ensureRegistry(i).clear();
          ensureOverlayIds(i).clear();
          restoreDrawings(chart, cellSeriesKey(next));
        });
      }
      updateCell(i, { symbol: info });
      if (opts.applyHandle) cellHandles.current[i]?.setSymbol(info);
      if (opts.emit) chartSyncBus.emit("symbol", i, { symbol: info });
      if (i === activeCellRef.current) void datafeed.prefetchDeeper(info, next.period);
    },
    [datafeed, updateCell],
  );

  const commitCellPeriod = useCallback(
    (i: number, p: Period, opts: { emit: boolean; applyHandle: boolean }) => {
      const prev = cellStatesRef.current[i];
      if (!prev) return;
      const chart = cellCharts.current[i];
      if (chart) {
        guarded(ensureSuppress(i), () => {
          saveDrawings(chart, cellSeriesKey(prev), [...ensureOverlayIds(i)]);
        });
      }
      updateCell(i, { period: p });
      if (opts.applyHandle) cellHandles.current[i]?.setPeriod(p);
      if (opts.emit) chartSyncBus.emit("period", i, { period: p });
    },
    [updateCell],
  );

  // ---------- sync bus listeners (one per cell, re-registered on ready) ---
  const registerBus = useCallback(
    (i: number) => {
      busUnsubs.current[i]?.();
      busUnsubs.current[i] = chartSyncBus.register(i, (e) => {
        const st = cellStatesRef.current[i];
        const handle = cellHandles.current[i];
        const chart = cellCharts.current[i];
        const suppress = ensureSuppress(i);
        switch (e.kind) {
          case "symbol": {
            const sym = (e.payload as { symbol: SymbolInfo }).symbol;
            if (!st || cellSymbolKey(st) === `${sym.market ?? "USDT-FUTURES"}:${sym.ticker}`) return;
            commitCellSymbol(i, sym, { emit: false, applyHandle: true });
            break;
          }
          case "period": {
            const p = (e.payload as { period: Period }).period;
            if (!st || st.period.text === p.text) return;
            commitCellPeriod(i, p, { emit: false, applyHandle: true });
            break;
          }
          case "crosshair": {
            if (!chart) return;
            const ts = (e.payload as { timestamp: number | null }).timestamp;
            if (ts == null) return;
            guarded(suppress, () => applyRemoteCrosshair(chart, ts));
            break;
          }
          case "range": {
            if (!chart) return;
            const { fromTs, toTs } = e.payload as { fromTs: number; toTs: number };
            guarded(suppress, () => applyRemoteRange(chart, fromTs, toTs));
            break;
          }
          case "draw": {
            if (!chart || !st) return;
            const p = e.payload as DrawSyncPayload;
            if (p.sourceSeries && p.sourceSeries !== cellSymbolKey(st)) return; // same-symbol rule
            guarded(suppress, () => applyRemoteDraw(chart, ensureRegistry(i), p));
            break;
          }
        }
      });
    },
    [commitCellPeriod, commitCellSymbol],
  );

  // ---------- per-cell chart lifecycle -------------------------------------
  const handleCellReady = useCallback(
    (i: number, chart: Chart | null) => {
      cellCharts.current[i] = chart;
      cellCleanups.current[i]?.();
      cellCleanups.current[i] = null;
      registerBus(i);
      if (!chart) {
        if (i === activeCellRef.current) setPrimaryChart(null);
        return;
      }
      if (i === activeCellRef.current) setPrimaryChart(chart);

      const setup = setupCellChart(chart, i, chartSyncBus, ensureSuppress(i), ensureRegistry(i), {
        isPrimary: () => activeCellRef.current === i,
        onSelect: setSelectedOverlay,
        onVisibleRange: (data) => {
          if (activeCellRef.current !== i) return;
          const r = data as { to?: number; realTo?: number };
          setAwayFromLive(r.realTo != null && r.to != null ? r.realTo - r.to > 5 : false);
        },
        getSymbolKey: () => {
          const st = cellStatesRef.current[i];
          return st ? cellSymbolKey(st) : "";
        },
        getSeriesKey: () => {
          const st = cellStatesRef.current[i];
          return st ? cellSeriesKey(st) : "";
        },
        recordOverlay: (id) => {
          ensureOverlayIds(i).add(id);
          if (activeCellRef.current === i) controller.recordOverlayId(id);
        },
        dropOverlay: (id) => {
          ensureOverlayIds(i).delete(id);
        },
      });
      cellCleanups.current[i] = () => {
        setup.cleanup();
        busUnsubs.current[i]?.();
        busUnsubs.current[i] = null;
      };

      const st = cellStatesRef.current[i];
      if (st) restoreDrawings(chart, cellSeriesKey(st));
      const persisted = restoredIndicators.current[i];
      if (persisted?.length) restoreCellIndicators(chart, persisted);
    },
    [registerBus],
  );

  const handleCellHandle = useCallback((i: number, handle: KLineChartProHandle | null) => {
    cellHandles.current[i] = handle;
  }, []);

  const handleActivate = useCallback((i: number) => {
    setActiveCell(i);
    setSelectedOverlay(null);
    setAwayFromLive(false);
    setPrimaryChart(cellCharts.current[i] ?? null);
  }, []);

  // ---------- layout changes ----------------------------------------------
  const handleLayoutChange = useCallback((n: number) => {
    setLayoutCount(n);
    setCellStates((prev) => {
      const src = prev[Math.min(activeCellRef.current, prev.length - 1)] ?? prev[0];
      const next = [...prev];
      while (next.length < n) next.push({ symbol: { ...src.symbol }, period: { ...src.period } });
      return next.slice(0, n);
    });
    setActiveCell((a) => Math.min(a, n - 1));
  }, []);

  // ---------- controller follows the primary chart -------------------------
  useEffect(() => {
    controller.attach(primaryChart);
    if (!primaryChart) return;
    for (const id of overlayIds.current[activeIdx] ?? []) controller.recordOverlayId(id);
  }, [primaryChart, activeIdx]);

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

  useEffect(() => {
    if (primaryChart) applyAutoLayers();
  }, [applyAutoLayers, primaryChart]);

  // ---------- layout persistence (grid state) ------------------------------
  const handleSaveTemplate = useCallback(() => {
    const grid = {
      layoutCount,
      activeCell,
      syncFlags,
      cells: cellStates.map((cs, idx) => ({
        category: cs.symbol.market ?? "USDT-FUTURES",
        symbol: cs.symbol.ticker,
        timeframe: periodToTimeframe(cs.period),
        indicators: collectCellIndicators(cellCharts.current[idx]),
      })),
    };
    const series = { category: symbol.market ?? "USDT-FUTURES", symbol: symbol.ticker, timeframe };
    api
      .saveChartConfig(series, { indicators: [], drawings: [], layers, grid } as unknown as ChartConfig)
      .catch(() => {});
  }, [layoutCount, activeCell, syncFlags, cellStates, symbol.market, symbol.ticker, timeframe, layers]);

  // Restore grid layout once on mount (best-effort).
  useEffect(() => {
    let alive = true;
    const series = {
      category: DEFAULT_SYMBOL.market ?? "USDT-FUTURES",
      symbol: DEFAULT_SYMBOL.ticker,
      timeframe: periodToTimeframe(DEFAULT_PERIOD),
    };
    api
      .chartConfig(series)
      .then(async (cfg) => {
        if (!alive || !cfg?.grid) return;
        const g = cfg.grid;
        const count = Math.max(1, Math.min(8, g.layoutCount ?? 1));
        const resolved = await Promise.all(
          (g.cells ?? []).slice(0, count).map((c) =>
            resolveSymbolInfo(c.symbol, c.category).catch(() => ({
              ticker: c.symbol,
              shortName: c.symbol,
              market: c.category,
              pricePrecision: 2,
              volumePrecision: 4,
            })),
          ),
        );
        if (!alive) return;
        restoredIndicators.current = (g.cells ?? []).slice(0, count).map((c) => c.indicators ?? []);
        const nextStates: CellState[] = resolved.length
          ? resolved.map((sym, idx) => ({
              symbol: sym,
              period: periodFromTimeframe(g.cells[idx]?.timeframe ?? "5m"),
            }))
          : Array.from({ length: count }, () => ({ symbol: DEFAULT_SYMBOL, period: DEFAULT_PERIOD }));
        setCellStates(nextStates);
        setLayoutCount(count);
        setActiveCell(Math.min(Math.max(0, g.activeCell ?? 0), count - 1));
        if (g.syncFlags) setSyncFlags({ ...DEFAULT_SYNC_FLAGS, ...g.syncFlags });
        // Apply the restored state to cells that are already mounted (the
        // pro instances only read their symbol/period at construction).
        window.setTimeout(() => {
          if (!alive) return;
          for (let i = 0; i < nextStates.length; i += 1) {
            const handle = cellHandles.current[i];
            const chart = cellCharts.current[i];
            if (handle) {
              commitCellSymbol(i, nextStates[i].symbol, { emit: false, applyHandle: true });
              commitCellPeriod(i, nextStates[i].period, { emit: false, applyHandle: true });
            }
            const ind = g.cells?.[i]?.indicators ?? [];
            if (chart && ind.length) restoreCellIndicators(chart, ind);
          }
        }, 0);
      })
      .catch(() => {
        /* no saved layout yet */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Save every cell's drawings on unmount.
  useEffect(
    () => () => {
      for (let i = 0; i < cellCharts.current.length; i += 1) {
        const chart = cellCharts.current[i];
        const st = cellStatesRef.current[i];
        if (chart && st) saveDrawings(chart, cellSeriesKey(st), [...ensureOverlayIds(i)]);
      }
      busUnsubs.current.forEach((u) => u?.());
    },
    [],
  );

  // ---------- top-bar & keyboard actions (routed to the active cell) -------
  useEffect(() => {
    let buf = "";
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === ",") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        cellCharts.current[activeCellRef.current]?.createOverlay({ name: "segment" });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        controller.undoLastDrawing();
        setSelectedOverlay(null);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) {
        buf += e.key;
        window.setTimeout(() => {
          buf = "";
        }, 800);
        const target = buf + "m";
        const p = PERIODS.find((x) => x.text.toLowerCase() === target);
        if (p) {
          commitCellPeriod(activeCellRef.current, p, { emit: true, applyHandle: true });
          buf = "";
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commitCellPeriod]);

  /** Accepts a `category:instId` composite key (or a bare instId fallback). */
  const handleSelect = useCallback(
    (composite: string) => {
      const { category: cat, instId } = splitSymbolKey(composite);
      void resolveSymbolInfo(instId, cat).then((info) => {
        commitCellSymbol(activeCellRef.current, info, { emit: true, applyHandle: true });
      });
    },
    [commitCellSymbol],
  );

  const handleCellSymbolChange = useCallback(
    (i: number, info: SymbolInfo) => {
      // The cell's own UI already applied the switch; sync the rest.
      commitCellSymbol(i, info, { emit: true, applyHandle: false });
    },
    [commitCellSymbol],
  );

  const handleCellPeriodChange = useCallback(
    (i: number, p: Period) => {
      commitCellPeriod(i, p, { emit: true, applyHandle: false });
    },
    [commitCellPeriod],
  );

  const handlePeriodChange = useCallback(
    (p: Period) => {
      commitCellPeriod(activeCellRef.current, p, { emit: true, applyHandle: true });
    },
    [commitCellPeriod],
  );

  const handleChartTypeChange = useCallback((type: CandleType) => {
    setChartType(type);
    cellHandles.current[activeCellRef.current]?.getChart()?.setStyles({ candle: { type } });
  }, []);

  const handleThemeChange = useCallback(
    (next: Theme) => {
      setTheme(next);
    },
    [setTheme],
  );

  const handleLocaleChange = useCallback(
    (next: Locale) => {
      setLocale(next);
    },
    [setLocale],
  );

  const activeRoot = () => cellHandles.current[activeCellRef.current]?.getRoot() ?? null;
  const handleOpenIndicator = useCallback(() => {
    const root = activeRoot();
    if (root) bridge.openIndicatorModal(root);
  }, []);
  const handleOpenTimezone = useCallback(() => {
    const root = activeRoot();
    if (root) bridge.openTimezoneModal(root);
  }, []);
  const handleOpenSettings = useCallback(() => {
    const root = activeRoot();
    if (root) bridge.openSettingModal(root);
  }, []);
  const handleOpenAlerts = useCallback(() => {
    setRightTab("alerts");
    setRightOpen(true);
  }, []);

  // Alt+wheel fast zoom + double-click reset over the chart area
  useEffect(() => {
    const area = chartAreaRef.current;
    if (!area) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.altKey) return;
      const c = cellCharts.current[activeCellRef.current];
      if (!c) return;
      e.preventDefault();
      const root = cellHandles.current[activeCellRef.current]?.getRoot();
      const widget = root?.querySelector<HTMLElement>(".klinecharts-pro-widget");
      const rect = widget?.getBoundingClientRect();
      const scale = e.deltaY < 0 ? 1.3 : 0.77;
      c.zoomAtCoordinate(scale, { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });
    };
    const onDblClick = (e: MouseEvent) => {
      const c = cellCharts.current[activeCellRef.current];
      if (!c) return;
      e.preventDefault();
      c.scrollToRealTime();
      const size = c.getSize();
      if (size) c.zoomAtCoordinate(1, { x: size.width / 2, y: size.height / 2 });
    };
    area.addEventListener("wheel", onWheel, { passive: false });
    area.addEventListener("dblclick", onDblClick);
    return () => {
      area.removeEventListener("wheel", onWheel);
      area.removeEventListener("dblclick", onDblClick);
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    const c = cellCharts.current[activeCellRef.current];
    if (!c) return;
    e.preventDefault();
    const root = cellHandles.current[activeCellRef.current]?.getRoot();
    const rect = root?.querySelector<HTMLElement>(".klinecharts-pro-widget")?.getBoundingClientRect();
    const x = e.clientX - (rect?.left ?? 0);
    const y = e.clientY - (rect?.top ?? 0);
    let price: number | undefined;
    try {
      const pt = c.convertFromPixel([{ x, y }], { paneId: "candle_pane" });
      const v = (Array.isArray(pt) ? pt[0] : pt)?.value;
      if (typeof v === "number" && Number.isFinite(v)) price = v;
    } catch {
      /* conversion may fail over empty panes */
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, price });
  };

  const ctxCreateAlert = () => {
    if (ctxMenu?.price != null) setAlertPrefill({ symbol: activeKey, threshold: ctxMenu.price });
    setRightTab("alerts");
    setRightOpen(true);
    setCtxMenu(null);
  };
  const ctxAddIndicator = () => {
    setCtxMenu(null);
    const root = activeRoot();
    if (root) bridge.openIndicatorModal(root);
  };
  const ctxCopyPrice = async () => {
    if (ctxMenu?.price != null) {
      try {
        await navigator.clipboard.writeText(String(ctxMenu.price));
      } catch {
        /* clipboard may be unavailable */
      }
    }
    setCtxMenu(null);
  };
  const ctxSettings = () => {
    setCtxMenu(null);
    const root = activeRoot();
    if (root) bridge.openSettingModal(root);
  };
  const ctxReset = () => {
    setCtxMenu(null);
    cellCharts.current[activeCellRef.current]?.scrollToRealTime();
    setAwayFromLive(false);
  };
  const backToLive = () => {
    cellCharts.current[activeCellRef.current]?.scrollToRealTime();
    setAwayFromLive(false);
  };

  const price = candles.length ? candles[candles.length - 1].close : undefined;
  const change =
    candles.length >= 2
      ? ((candles[candles.length - 1].close - candles[0].open) / candles[0].open) * 100
      : undefined;
  const up = (change ?? 0) >= 0;

  const renderRightPanel = (tab: RightTabId) => {
    switch (tab) {
      case "watchlist":
        return <WatchlistPanel tickerState={tickerList} active={activeKey} onSelect={handleSelect} />;
      case "alerts":
        return (
          <AlertsPanel
            symbols={tickerList.symbols}
            priceMap={tickerList.priceMap}
            defaultSymbol={activeKey}
            prefill={alertPrefill}
            onTrigger={handleAlertTrigger}
          />
        );
      case "datawindow":
        return <DataWindowPanel symbol={symbol.ticker} timeframe={timeframe} candles={candles} />;
      case "dom":
        return <DomPanel book={orderBook} trades={trades} derivative={derivative} />;
      case "broker":
        return <BrokerPanel symbol={symbol.ticker} category={category} />;
    }
  };

  const renderDockPanel = (tab: DockTabId) => {
    switch (tab) {
      case "ai":
        return <AiDockPanel symbol={symbol.ticker} timeframe={timeframe} />;
      case "backtest":
        return <BacktestPanel symbol={symbol.ticker} timeframe={timeframe} />;
      case "screener":
        return <ScreenerPanel tickerState={tickerList} active={activeKey} onSelect={handleSelect} />;
      case "broker":
        return <BrokerPanel symbol={symbol.ticker} category={category} />;
    }
  };

  return (
    <div className="flex h-screen flex-col bg-base text-text">
      <TVTopBar
        symbol={symbol}
        period={period}
        periods={PERIODS}
        chartType={chartType}
        layoutCount={layoutCount}
        syncFlags={syncFlags}
        onSyncFlagChange={(kind, on) => setSyncFlags((f) => ({ ...f, [kind]: on }))}
        t={t}
        locale={locale}
        onLocaleChange={handleLocaleChange}
        theme={theme}
        onThemeChange={handleThemeChange}
        onOpenSearch={() => setSearchOpen(true)}
        onPeriodChange={handlePeriodChange}
        onChartTypeChange={handleChartTypeChange}
        onLayoutChange={handleLayoutChange}
        onOpenIndicator={handleOpenIndicator}
        onOpenTimezone={handleOpenTimezone}
        onOpenSettings={handleOpenSettings}
        onOpenAlerts={handleOpenAlerts}
        onOpenReplay={enterReplay}
        onSaveTemplate={handleSaveTemplate}
      />
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div
            ref={chartAreaRef}
            className="group relative min-h-0 flex-1"
            data-testid="chart-area"
            onContextMenu={handleContextMenu}
          >
            <ChartGrid
              count={layoutCount}
              cells={cellStates}
              periods={PERIODS}
              datafeed={datafeed}
              theme={theme}
              locale={locale === "zh" ? "zh-CN" : "en-US"}
              watermarkFor={(c) => `${c.symbol.ticker} · ${c.period.text}`}
              activeIndex={activeIdx}
              onActivate={handleActivate}
              onCellHandle={handleCellHandle}
              onCellReady={handleCellReady}
              onCellSymbolChange={handleCellSymbolChange}
              onCellPeriodChange={handleCellPeriodChange}
            />
            {primaryChart && (
              <ChartLegend
                chart={primaryChart}
                candles={candles}
                symbol={symbol.ticker}
                period={period.text}
                exchange={category}
              />
            )}
            {primaryChart && <ChartAxisControls chart={primaryChart} />}
            {primaryChart && selectedOverlay && (
              <ChartFloatingToolbar
                chart={primaryChart}
                overlayId={selectedOverlay}
                onClose={() => setSelectedOverlay(null)}
              />
            )}
            {primaryChart && awayFromLive && !replaySnap.active && (
              <button
                onClick={backToLive}
                className="absolute bottom-9 right-10 z-20 rounded-modal border border-border bg-panel px-2 py-1 text-xs text-text shadow-float hover:bg-hover"
                data-testid="back-to-live"
              >
                ↓ {t("chart.backToLive")}
              </button>
            )}
          </div>
          {replaySnap.active && (
            <ReplayBar
              snap={replaySnap}
              paper={{
                realized: paperRef.current?.realized ?? 0,
                floating: paperRef.current?.floating(replayEngine.last?.close ?? NaN) ?? 0,
                openPositions: paperRef.current?.positions.length ?? 0,
                trades: paperRef.current?.trades ?? 0,
                wins: paperRef.current?.wins ?? 0,
              }}
              onPlayToggle={replayPlayToggle}
              onStep={replayStep}
              onSpeed={replaySpeed}
              onSeek={replaySeek}
              onExit={exitReplay}
              onOrder={replayOrder}
              onCloseAll={replayCloseAll}
              t={t}
            />
          )}
          <div className="flex h-8 shrink-0 items-center gap-3 border-t border-border px-3 text-xs text-muted">
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
        <TVRightSidebar
          tabs={RIGHT_TABS}
          activeTab={rightOpen ? rightTab : null}
          onTabChange={setRightTab}
          panelOpen={rightOpen}
          onTogglePanel={() => setRightOpen((o) => !o)}
          width={rightWidth}
          onWidthChange={setRightWidth}
          renderPanel={renderRightPanel}
        />
      </div>
      <TVBottomDock
        tabs={DOCK_TABS}
        activeTab={dockOpen ? dockTab : null}
        onTabChange={setDockTab}
        expanded={dockOpen}
        onToggle={() => setDockOpen((o) => !o)}
        heightVh={dockHeight}
        onHeightChange={setDockHeight}
        renderPanel={renderDockPanel}
      />
      <TVStatusBar
        symbol={symbol.ticker}
        price={price}
        change={change}
        up={up}
        conn={connState}
        onTimezone={handleOpenTimezone}
      />
      {ctxMenu && (
        <ChartContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onAlert={ctxCreateAlert}
          onIndicator={ctxAddIndicator}
          onCopy={ctxCopyPrice}
          onSettings={ctxSettings}
          onReset={ctxReset}
        />
      )}
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        searchSymbols={(q) => datafeed.searchSymbols(q)}
        priceMap={tickerList.priceMap}
        onSelect={handleSelect}
      />
      <ToastStack toasts={toasts} />
    </div>
  );
}

// Ensure SyncKind stays in sync with the flag toggles (type-level guard).
export type AppSyncKind = SyncKind;
