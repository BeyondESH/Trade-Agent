import type { Period, SymbolInfo as ProSymbolInfo } from "@klinecharts/pro";
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { periodFromTimeframe, periodToTimeframe } from "./api/datafeed";
import type { SeriesRef } from "./api/types";
import { INITIAL_CALENDAR } from "./data/marketData";
import { useCandles } from "./hooks/useCandles";
import { type BookLevel, useOrderBook } from "./hooks/useOrderBook";
import { useRealSymbols } from "./hooks/useRealSymbols";
import { useTrades } from "./hooks/useTrades";
import type {
  AlertItem,
  Candle,
  DesktopTab,
  DesktopViewMode,
  EconomicEvent,
  IndicatorConfig,
  OrderBookEntry,
  SymbolInfo,
  ThemeMode,
} from "./types/trading";

const DEFAULT_SYMBOL: SymbolInfo = {
  id: "BTCUSDT",
  ticker: "BTCUSDT",
  name: "Bitcoin / Tether Perpetual",
  exchange: "USDT-FUTURES",
  category: "crypto",
  price: 0,
  change24h: 0,
  change24hPercent: 0,
  high24h: 0,
  low24h: 0,
  volume24h: "-",
  digits: 2,
  baseAsset: "BTC",
  quoteAsset: "USDT",
  description: "Bitcoin perpetual contract",
};

import { api } from "./api/client";
import { BottomDock } from "./components/bottom/BottomDock";

// SuperCharts Components
// NativeChart is code-split too — see the lazy() declaration below.
// Desktop Shell Components
import { DesktopTitleBar } from "./components/desktop/DesktopTitleBar";
import { GlobalNavRail } from "./components/desktop/GlobalNavRail";
import { MarketTape } from "./components/desktop/MarketTape";
import { CommandPaletteModal } from "./components/modals/CommandPaletteModal";
// Modals & Overlays
import { CreateAlertModal } from "./components/modals/CreateAlertModal";
import { DesktopSettingsModal } from "./components/modals/DesktopSettingsModal";
import { KeyboardShortcutsModal } from "./components/modals/KeyboardShortcutsModal";
import { RightDock } from "./components/sidebar/RightDock";
import { ToastHost } from "./components/ToastHost";
import { BottomTimebar } from "./components/timebar/BottomTimebar";
import { Skeleton } from "./components/ui/skeleton";
// Dedicated Desktop Full Views
import { DashboardView } from "./components/views/DashboardView";

// Only the *chart* view is eager: it is the default view AND its
// `.klinecharts-pro-watermark` is the measured LCP element (Chrome trace at
// 4x CPU + Fast 4G) originally suggested the chart library sat on the critical
// path for the largest paint, so deferring it would move LCP later.
// MEASUREMENT REFUTED THAT: lazily loading the chart too improved every axis
// (LCP 2,037 -> 1,898/2,005 ms, first-paint JS ~907 -> ~522 KB, render-blocking
// CSS 108 KB / 2 requests -> 68.3 KB / 1 request) with CLS unchanged at 0.00.
// The chart library is therefore code-split as well. See
// docs/frontend-performance.md for the numbers and the method.
//
// The six non-chart views are never on the first-paint path, so they are
// code-split behind React.lazy and fetched only when the user opens them.
const MarketsView = lazy(() =>
  import("./components/views/MarketsView").then((m) => ({ default: m.MarketsView })),
);
const ScreenerView = lazy(() =>
  import("./components/views/ScreenerView").then((m) => ({ default: m.ScreenerView })),
);
const HeatmapsView = lazy(() =>
  import("./components/views/HeatmapsView").then((m) => ({ default: m.HeatmapsView })),
);
const CommunityIdeasView = lazy(() =>
  import("./components/views/CommunityIdeasView").then((m) => ({
    default: m.CommunityIdeasView,
  })),
);
const NewsCalendarView = lazy(() =>
  import("./components/views/NewsCalendarView").then((m) => ({ default: m.NewsCalendarView })),
);
const ResearchView = lazy(() =>
  import("./components/views/ResearchView").then((m) => ({ default: m.ResearchView })),
);
// The chart library is code-split as well. The earlier worry that deferring it
// would delay the LCP watermark was refuted by measurement — see above.
const NativeChart = lazy(() =>
  import("./components/chart/NativeChart").then((m) => ({ default: m.NativeChart })),
);
import {
  isNotifyEnabled,
  notifyAlert,
  setNotifyEnabled as persistNotifyEnabled,
  requestNotifyPermission,
} from "./lib/alertNotify";
import {
  type Alert,
  evaluateAlerts,
  loadAlerts,
  mirrorAlertCreate,
  mirrorAlertDelete,
  mirrorAlertUpdate,
  removeAlert,
  resetAlert,
  setAlertEnabled,
  subscribeAlerts,
  syncAlertsFromServer,
  updateAlert,
  upsertAlert,
} from "./lib/alertsStore";
import { t } from "./lib/i18n";
import { pushToast } from "./lib/toastStore";
import { pickMajors } from "./lib/watchlist";

/** Map a store Alert to the sidebar AlertItem shape. */
function alertToItem(a: Alert): AlertItem {
  return {
    id: a.id,
    symbol: a.symbol,
    condition: a.condition === "below" ? "Less Than" : "Greater Than",
    targetPrice: a.threshold,
    createdAt: new Date(a.createdAt).toISOString().slice(0, 16),
    enabled: a.enabled,
    triggered: a.triggered,
    triggerTime: a.triggerTime,
    note: "",
    frequency: "Every Time",
  };
}

/**
 * Placeholder shown while a lazily-loaded view's chunk is in flight. It fills
 * the same workspace box as a real view so the swap introduces no layout shift
 * (the chart view, which owns the initial paint, is never suspended).
 */
const SKELETON_TILES = ["a", "b", "c", "d", "e", "f"];
const ViewSkeleton: React.FC = () => (
  <div
    role="status"
    className="flex flex-col flex-1 h-full w-full gap-3 p-4"
    aria-busy="true"
    aria-label="正在加载视图"
  >
    <Skeleton className="h-9 w-52" />
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {SKELETON_TILES.map((tile) => (
        <Skeleton key={tile} className="h-28" />
      ))}
    </div>
  </div>
);

export default function App() {
  // 1. Desktop Multi-Tab System
  const [tabs, setTabs] = useState<DesktopTab[]>([
    {
      id: "tab-1",
      title: "BTCUSDT.P",
      type: "chart",
      symbol: "BTCUSDT.P",
      isPinned: false,
    },
    { id: "tab-2", title: "Markets", type: "markets", isPinned: false },
    { id: "tab-3", title: "Screener 2.0", type: "screener", isPinned: false },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("tab-1");

  // Active workspace derived from active tab
  const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const isDashboard = currentTab?.type === "dashboard";
  const activeView: DesktopViewMode =
    currentTab && currentTab.type !== "dashboard" ? currentTab.type : "chart";

  // 2. Symbol & Market State
  const { symbols: realSymbols, priceMap } = useRealSymbols();
  // Drives the tape's live marker: true once the realtime feed has delivered quotes.
  const feedLive = Object.keys(priceMap).length > 0;
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [activeSymbol, setActiveSymbol] = useState<SymbolInfo>(DEFAULT_SYMBOL);
  const [timeframe, setTimeframe] = useState<string>("1h");
  const [selectedRange, setSelectedRange] = useState<string>("1D");

  // Chart Scale Settings
  const [isLogScale, setIsLogScale] = useState<boolean>(false);
  const [isPercentScale, setIsPercentScale] = useState<boolean>(false);
  const [isAutoScale, setIsAutoScale] = useState<boolean>(true);

  // 3. Candlestick Data (real history + live via datafeed-backed hooks)
  const activeSeries: SeriesRef | null = useMemo(() => {
    if (!activeSymbol || activeSymbol === DEFAULT_SYMBOL) return null;
    return {
      category: "USDT-FUTURES",
      symbol: activeSymbol.id,
      timeframe: periodToTimeframe(periodFromTimeframe(timeframe)),
    };
  }, [activeSymbol, timeframe]);

  const { candles: apiCandles } = useCandles(activeSeries, 300);
  // map backend candles (open_time) to the template Candle shape (time)
  const candles: Candle[] = useMemo(
    () =>
      apiCandles.map((c) => ({
        time: c.open_time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
    [apiCandles],
  );

  // Seed the symbol list from the real market feed (REST + WS) and keep the
  // displayed quotes fresh: existing symbols get their price/24h fields
  // overwritten from the live ticker map, while transient user-added symbols
  // are preserved. New reference only when something actually changes.
  useEffect(() => {
    if (realSymbols.length === 0) return;
    setSymbols((prev) => {
      if (prev.length === 0) return realSymbols;
      const byId = new Map(prev.map((s) => [s.id, s]));
      let changed = false;
      for (const real of realSymbols) {
        const cur = byId.get(real.id);
        if (!cur) {
          byId.set(real.id, real);
          changed = true;
        } else if (
          cur.price !== real.price ||
          cur.change24hPercent !== real.change24hPercent ||
          cur.change24h !== real.change24h ||
          cur.high24h !== real.high24h ||
          cur.low24h !== real.low24h ||
          cur.volume24h !== real.volume24h
        ) {
          byId.set(real.id, { ...cur, ...real });
          changed = true;
        }
      }
      return changed ? [...byId.values()] : prev;
    });
  }, [realSymbols]);

  // Default active symbol to the first real one (BTCUSDT usually).
  useEffect(() => {
    if (activeSymbol === DEFAULT_SYMBOL && realSymbols.length > 0) {
      setActiveSymbol(realSymbols.find((s) => s.id === "BTCUSDT") ?? realSymbols[0]);
    }
  }, [activeSymbol, realSymbols]);

  // Keep the active symbol's price fresh from the ticker map.
  useEffect(() => {
    if (activeSymbol && activeSymbol !== DEFAULT_SYMBOL && priceMap[activeSymbol.id] != null) {
      const p = priceMap[activeSymbol.id];
      if (p != null && p !== activeSymbol.price) {
        setActiveSymbol((prev) => (prev ? { ...prev, price: p } : prev));
      }
    }
  }, [activeSymbol, priceMap]);

  // 4. Technical Indicators
  const [indicators] = useState<IndicatorConfig[]>([]);

  // 5. Theme
  const [theme, setTheme] = useState<ThemeMode>("dark");

  // The design tokens are swapped by [data-theme] on <html>, so this attribute
  // is what actually drives every colour in the app. `theme` stays the single
  // source of truth for both the CSS layer and the canvas chart theme.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // 7. Secondary Layouts & Panels
  const [events] = useState<EconomicEvent[]>(INITIAL_CALENDAR);
  const rawBook = useOrderBook(activeSymbol?.id ?? "BTCUSDT", "USDT-FUTURES");
  const trades = useTrades(activeSymbol?.id ?? "BTCUSDT", "USDT-FUTURES");
  const orderBook: {
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
    spread: number | null;
  } = useMemo(() => {
    const toEntries = (levels: BookLevel[], desc: boolean): OrderBookEntry[] => {
      const sorted = [...levels].sort((a, b) => (desc ? b.price - a.price : a.price - b.price));
      let total = 0;
      return sorted.map((l) => {
        total += l.size;
        return { price: l.price, amount: l.size, total };
      });
    };
    return {
      bids: toEntries(rawBook.bids, true),
      asks: toEntries(rawBook.asks, false),
      spread: rawBook.spread,
    };
  }, [rawBook]);
  const [alerts, setAlerts] = useState<AlertItem[]>(() => loadAlerts().map(alertToItem));

  // Pull server alerts on mount (cross-device); failures keep local state.
  useEffect(() => {
    syncAlertsFromServer().then((server) => {
      if (server && server.length > 0) {
        setAlerts(server.map(alertToItem));
      }
    });
  }, []);

  // Keep the sidebar in sync with the price-line store (chart edits, drags,
  // right-click reference lines all flow through alertsStore).
  useEffect(() => {
    const off = subscribeAlerts((list) => setAlerts(list.map(alertToItem)));
    return off;
  }, []);

  // Trigger evaluation: run enabled, untriggered alerts against the shared
  // realtime ticker map. A hit is marked locally + mirrored, then toasted
  // (always) and pushed as a browser notification only when the user opted in.
  const priceMapRef = useRef(priceMap);
  useEffect(() => {
    priceMapRef.current = priceMap;
  }, [priceMap]);

  const applyTriggerHits = useCallback((prices: Record<string, number | undefined>) => {
    const hits = evaluateAlerts(loadAlerts(), prices);
    if (hits.length === 0) return;
    for (const hit of hits) {
      const alert = loadAlerts().find((a) => a.id === hit.id);
      if (!alert) continue;
      updateAlert(hit.id, { triggered: true, triggerTime: hit.triggerTime });
      mirrorAlertUpdate(hit.id, {
        triggered: true,
        triggerTime: hit.triggerTime,
      });
      const label = `${alert.symbol} ${alert.condition === "above" ? "\u2265" : "\u2264"} ${alert.threshold}`;
      const title = t("Price Alert Triggered");
      pushToast({ id: `alert-${hit.id}`, title, message: label });
      notifyAlert(title, label);
    }
  }, []);

  useEffect(() => {
    applyTriggerHits(priceMap);
  }, [priceMap, applyTriggerHits]);

  // Fallback: symbols the realtime feed does not cover (WS gap / no ticker)
  // are refreshed from the low-frequency REST snapshot.
  useEffect(() => {
    const timer = setInterval(() => {
      const stale = loadAlerts().some(
        (a) => a.enabled && !a.triggered && priceMapRef.current[a.symbol] == null,
      );
      if (!stale) return;
      void api
        .tickers()
        .then(({ tickers }) => {
          const prices: Record<string, number | undefined> = {
            ...priceMapRef.current,
          };
          for (const tk of tickers) {
            const key = tk.instId ?? tk.symbol;
            if (key) prices[key] = Number(tk.lastPr);
          }
          applyTriggerHits(prices);
        })
        .catch(() => {
          /* offline: keep waiting for the WS feed */
        });
    }, 20000);
    return () => clearInterval(timer);
  }, [applyTriggerHits]);

  // Enable/disable + reset: the store helpers persist and mirror the change.
  const handleToggleAlert = useCallback((id: string, enabled: boolean) => {
    setAlertEnabled(id, enabled);
  }, []);
  const handleResetAlert = useCallback((id: string) => {
    resetAlert(id);
  }, []);

  const [notifyEnabled, setNotifyEnabledState] = useState<boolean>(() => isNotifyEnabled());
  // Permission is requested inside this click handler (a user gesture), never on mount.
  const handleToggleNotifications = useCallback(() => {
    const next = !notifyEnabled;
    setNotifyEnabledState(next);
    persistNotifyEnabled(next);
    if (next) void requestNotifyPermission();
  }, [notifyEnabled]);

  // 9. Modals State
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  // Price prefilled into the create-alert modal by the chart right-click menu.
  const [alertPrefillPrice, setAlertPrefillPrice] = useState<number | null>(null);
  const handleCreateAlertAt = (price: number) => {
    setAlertPrefillPrice(price);
    setIsAlertOpen(true);
  };
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isDesktopSettingsOpen, setIsDesktopSettingsOpen] = useState(false);

  // Tab Management Handlers
  const handleSelectTab = (id: string) => {
    setActiveTabId(id);
    const tab = tabs.find((t) => t.id === id);
    if (tab && tab.symbol) {
      const match = symbols.find((s) => s.ticker === tab.symbol || s.id === tab.symbol);
      if (match) setActiveSymbol(match);
    }
  };

  const handleCloseTab = (id: string) => {
    if (tabs.length <= 1) return;
    const nextTabs = tabs.filter((t) => t.id !== id);
    setTabs(nextTabs);
    if (activeTabId === id) {
      setActiveTabId(nextTabs[0].id);
    }
  };

  const handleNewTab = (type: DesktopViewMode | "dashboard", symbolTicker?: string) => {
    const newId = `tab-${Date.now()}`;
    let title = "SuperCharts";
    if (type === "chart") title = symbolTicker || activeSymbol.ticker;
    else if (type === "markets") title = "Markets";
    else if (type === "screener") title = "Screener";
    else if (type === "heatmaps") title = "Heatmaps";
    else if (type === "community") title = "Community";
    else if (type === "news") title = "News";
    else if (type === "research") title = "Research";
    else if (type === "dashboard") title = "Dashboard";

    const newTab: DesktopTab = {
      id: newId,
      title,
      type,
      symbol: symbolTicker || (type === "chart" ? activeSymbol.ticker : undefined),
      isPinned: false,
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  };

  // Promotes the currently-active tab (typically a freshly-created dashboard tab)
  // into a concrete view type in place — same tab id, title/type updated, and the
  // tab stays active so the workspace router immediately shows the chosen view.
  const handlePromoteTab = (type: DesktopViewMode) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              type,
              title:
                type === "chart"
                  ? t.symbol || activeSymbol.ticker
                  : type === "markets"
                    ? "Markets"
                    : type === "screener"
                      ? "Screener"
                      : type === "heatmaps"
                        ? "Heatmaps"
                        : type === "community"
                          ? "Community"
                          : "News",
              symbol: type === "chart" ? t.symbol || activeSymbol.ticker : undefined,
            }
          : t,
      ),
    );
  };

  const handleSelectGlobalRailView = (view: DesktopViewMode) => {
    // Check if tab already exists
    const existing = tabs.find((t) => t.type === view);
    if (existing) {
      setActiveTabId(existing.id);
    } else {
      handleNewTab(view);
    }
  };

  const handlePinTab = (id: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, isPinned: !t.isPinned } : t)));
  };

  // Open Chart with specific Symbol from other views
  const handleOpenChartWithSymbol = (sym: SymbolInfo) => {
    setActiveSymbol(sym);
    // Find chart tab or update current tab
    const chartTab = tabs.find((t) => t.type === "chart");
    if (chartTab) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === chartTab.id ? { ...t, title: sym.ticker, symbol: sym.ticker } : t,
        ),
      );
      setActiveTabId(chartTab.id);
    } else {
      handleNewTab("chart", sym.ticker);
    }
  };

  const handleOpenChartWithTicker = (ticker: string) => {
    const match = symbols.find(
      (s) =>
        s.ticker.toUpperCase() === ticker.toUpperCase() ||
        s.id.toUpperCase() === ticker.toUpperCase(),
    );
    if (match) {
      handleOpenChartWithSymbol(match);
    } else {
      // Create transient symbol if not found
      const newSym: SymbolInfo = {
        id: ticker.toUpperCase(),
        ticker: ticker.toUpperCase(),
        name: `${ticker.toUpperCase()} Asset`,
        exchange: "GLOBAL",
        category: "crypto",
        price: 100.0,
        change24h: 2.5,
        change24hPercent: 2.5,
        high24h: 105.0,
        low24h: 98.0,
        volume24h: "$120M",
        digits: 2,
        baseAsset: ticker.toUpperCase(),
        quoteAsset: "USD",
        description: `${ticker.toUpperCase()} spot trading instrument on global markets`,
      };
      setSymbols((prev) => [newSym, ...prev]);
      handleOpenChartWithSymbol(newSym);
    }
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input/textarea
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      // Command Palette (⌘K / Ctrl+K)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }

      // New Tab (⌘T / Ctrl+T)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        handleNewTab("chart");
      }

      // Close Tab (⌘W / Ctrl+W)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "w") {
        e.preventDefault();
        handleCloseTab(activeTabId);
      }

      // Question Mark (?) -> Shortcuts Modal
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
      }

      // Space -> Next Symbol in watchlist
      if (e.key === " " && !e.shiftKey) {
        e.preventDefault();
        const currIdx = symbols.findIndex((s) => s.id === activeSymbol.id);
        const nextIdx = (currIdx + 1) % symbols.length;
        handleSelectSymbol(symbols[nextIdx]);
      }

      // Shift + Space -> Prev Symbol
      if (e.key === " " && e.shiftKey) {
        e.preventDefault();
        const currIdx = symbols.findIndex((s) => s.id === activeSymbol.id);
        const prevIdx = (currIdx - 1 + symbols.length) % symbols.length;
        handleSelectSymbol(symbols[prevIdx]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSymbol.id, symbols, activeTabId]);

  // Handlers
  const handleSelectSymbol = (sym: SymbolInfo) => {
    setActiveSymbol(sym);
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId && t.type === "chart"
          ? { ...t, title: sym.ticker, symbol: sym.ticker }
          : t,
      ),
    );
  };

  // Native klinecharts-pro symbol change (from its built-in symbol search):
  // map the pro SymbolInfo back to the shell SymbolInfo so the right dock
  // (order book / trades / data window) follows the chart.
  const handleNativeSymbolChange = useCallback(
    (ps: ProSymbolInfo) => {
      const ticker = ps.ticker;
      setActiveSymbol((prev) => {
        if (prev && prev.id === ticker) return prev;
        return {
          id: ticker,
          ticker,
          name: ps.name ?? ticker,
          exchange: ps.exchange ?? ps.market ?? "USDT-FUTURES",
          category: "crypto",
          price: 0,
          change24h: 0,
          change24hPercent: 0,
          high24h: 0,
          low24h: 0,
          volume24h: "-",
          digits: ps.pricePrecision ?? 2,
          baseAsset: ticker.replace(/USDT|USDC$/, ""),
          quoteAsset: "USDT",
          description: "",
        };
      });
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId && t.type === "chart" ? { ...t, title: ticker, symbol: ticker } : t,
        ),
      );
    },
    [activeTabId],
  );

  // Native period-bar change -> keep shell timeframe in sync (DataWindow etc.).
  const handleNativePeriodChange = useCallback((p: Period) => {
    setTimeframe(periodToTimeframe(p));
  }, []);

  const activeCandle = candles[candles.length - 1] || null;

  // The tape is a glanceable ribbon, not a directory: the exchange lists
  // thousands of instruments, so lead with the ones a trader recognises.
  const tapeSymbols = useMemo(
    () => pickMajors(symbols, activeSymbol?.id, 14),
    [symbols, activeSymbol?.id],
  );

  // Bottom dock open state — when open, the chart workspace becomes a vertical
  // scroll container so tall bottom panels reveal fully (right-dock-ui-polish).
  const [bottomOpen, setBottomOpen] = useState<boolean>(false);
  const chartWorkspaceRef = useRef<HTMLDivElement>(null);
  const wasBottomOpenRef = useRef(false);

  // Auto-scroll to the bottom module the first time the drawer opens, so the
  // newly revealed content is immediately visible. Only fires on the false→true
  // transition — subsequent tab/maximize switches or manual scrolls are honored.
  useEffect(() => {
    if (bottomOpen && !wasBottomOpenRef.current && chartWorkspaceRef.current) {
      chartWorkspaceRef.current.scrollTop = chartWorkspaceRef.current.scrollHeight;
    }
    wasBottomOpenRef.current = bottomOpen;
  }, [bottomOpen]);

  return (
    <div
      id="trade-agent-root"
      className="flex flex-col h-screen w-screen overflow-hidden font-sans select-none bg-ink text-content"
    >
      {/* 1. Trade-Agent Desktop Top TitleBar & Multi-Tab Manager */}
      <DesktopTitleBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        onPinTab={handlePinTab}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenDesktopSettings={() => setIsDesktopSettingsOpen(true)}
        onOpenShortcutsModal={() => setIsShortcutsOpen(true)}
        triggeredAlerts={alerts.filter((a) => a.triggered)}
      />

      {/* 1b. Market tape — the terminal's always-on read of the market pulse */}
      <MarketTape
        symbols={tapeSymbols}
        activeSymbolId={activeSymbol?.id}
        live={feedLive}
        onSelectSymbol={handleSelectSymbol}
      />

      {/* 2. Main Desktop Client Body: Global Left Rail + Active Workspace View */}
      <div className="flex flex-1 w-full overflow-hidden relative">
        {/* Global Primary Navigation Rail */}
        <GlobalNavRail
          activeView={activeView}
          onSelectView={handleSelectGlobalRailView}
          theme={theme}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onOpenShortcuts={() => setIsShortcutsOpen(true)}
          onOpenSettings={() => setIsDesktopSettingsOpen(true)}
          onOpenAlertModal={() => setIsAlertOpen(true)}
        />

        {/* Dynamic Workspace Router */}
        <main
          key={isDashboard ? "dashboard" : activeView}
          className="flex flex-col flex-1 h-full overflow-hidden relative animate-[ta-fade_0.22s_ease-out]"
        >
          {/* One Suspense boundary for the lazily-loaded views; the eager chart
              branch below never suspends, so first paint is unaffected. */}
          <Suspense fallback={<ViewSkeleton />}>
            {isDashboard && (
              <DashboardView
                onOpen={(type) => handlePromoteTab(type)}
                symbols={symbols}
                onOpenSymbol={handleOpenChartWithSymbol}
              />
            )}

            {!isDashboard && activeView === "chart" && (
              <div
                ref={chartWorkspaceRef}
                className={`flex flex-col h-full w-full ${
                  bottomOpen ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden"
                }`}
              >
                {/* Chart Main Layout Area */}
                <div
                  className={`flex w-full overflow-hidden relative transition-all ${
                    bottomOpen ? "min-h-full flex-none" : "flex-1"
                  }`}
                >
                  {/* Central native klinecharts-pro chart */}
                  <div className="flex flex-col flex-1 h-full overflow-hidden relative">
                    {/* Nested boundary: only the chart area suspends, so the
                        docks around it still paint immediately. */}
                    <Suspense fallback={<ViewSkeleton />}>
                      <NativeChart
                        symbol={activeSymbol}
                        timeframe={timeframe}
                        theme={theme}
                        onSymbolChange={handleNativeSymbolChange}
                        onPeriodChange={handleNativePeriodChange}
                        onCreateAlertAt={handleCreateAlertAt}
                      />
                    </Suspense>

                    {/* Time Range Selector & Scale Badges Bar */}
                    <BottomTimebar
                      onSelectRange={setSelectedRange}
                      selectedRange={selectedRange}
                      isLogScale={isLogScale}
                      onToggleLogScale={() => setIsLogScale(!isLogScale)}
                      isPercentScale={isPercentScale}
                      onTogglePercentScale={() => setIsPercentScale(!isPercentScale)}
                      isAutoScale={isAutoScale}
                      onToggleAutoScale={() => setIsAutoScale(!isAutoScale)}
                      theme={theme}
                    />
                  </div>

                  {/* Right Dock (Watchlist, Alerts, News, Data Window, Hotlists, Calendar, DOM, Ideas) */}
                  <RightDock
                    symbols={symbols}
                    activeSymbol={activeSymbol}
                    onSelectSymbol={handleSelectSymbol}
                    onAddSymbol={() => setIsCommandPaletteOpen(true)}
                    activeCandle={activeCandle}
                    indicators={indicators}
                    alerts={alerts}
                    onRemoveAlert={(id) => {
                      setAlerts((prev) => prev.filter((a) => a.id !== id));
                      removeAlert(id);
                      mirrorAlertDelete(id);
                    }}
                    onToggleAlert={handleToggleAlert}
                    onResetAlert={handleResetAlert}
                    notifyEnabled={notifyEnabled}
                    onToggleNotifications={handleToggleNotifications}
                    onOpenCreateAlert={() => setIsAlertOpen(true)}
                    events={events}
                    orderBook={orderBook}
                    trades={trades}
                    theme={theme}
                  />
                </div>

                {/* Bottom Dock (Screener, Text Notes) */}
                <BottomDock
                  symbol={activeSymbol}
                  symbols={symbols}
                  onSelectSymbol={handleSelectSymbol}
                  onOpenChange={setBottomOpen}
                  theme={theme}
                />
              </div>
            )}

            {activeView === "markets" && <MarketsView theme={theme} />}

            {activeView === "screener" && (
              <ScreenerView
                symbols={symbols}
                onOpenChartWithTicker={handleOpenChartWithTicker}
                theme={theme}
              />
            )}

            {activeView === "heatmaps" && (
              <HeatmapsView onOpenChartWithTicker={handleOpenChartWithTicker} theme={theme} />
            )}

            {activeView === "community" && (
              <CommunityIdeasView onOpenChartWithTicker={handleOpenChartWithTicker} theme={theme} />
            )}

            {activeView === "news" && (
              <NewsCalendarView onOpenChartWithTicker={handleOpenChartWithTicker} theme={theme} />
            )}

            {activeView === "research" && <ResearchView theme={theme} />}
          </Suspense>
        </main>
      </div>

      {/* 3. Global Modals & Overlays */}
      <ToastHost theme={theme} />

      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        symbols={symbols}
        onSelectSymbol={handleSelectSymbol}
        onSelectView={handleSelectGlobalRailView}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onOpenSettings={() => setIsDesktopSettingsOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        theme={theme}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        theme={theme}
      />

      <DesktopSettingsModal
        isOpen={isDesktopSettingsOpen}
        onClose={() => setIsDesktopSettingsOpen(false)}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />

      {isAlertOpen && (
        <CreateAlertModal
          isOpen={isAlertOpen}
          onClose={() => {
            setIsAlertOpen(false);
            setAlertPrefillPrice(null);
          }}
          symbol={activeSymbol}
          initialPrice={alertPrefillPrice ?? undefined}
          onAddAlert={(newAlt) => {
            setAlerts((prev) => [newAlt, ...prev]);
            const mapped: Alert = {
              id: newAlt.id,
              symbol: newAlt.symbol,
              condition: newAlt.condition.includes("Less") ? "below" : "above",
              threshold: newAlt.targetPrice,
              enabled: true,
              triggered: false,
              createdAt: Date.now(),
            };
            upsertAlert(mapped);
            mirrorAlertCreate(mapped);
          }}
          theme={theme}
        />
      )}
    </div>
  );
}
