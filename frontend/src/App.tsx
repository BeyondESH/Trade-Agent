import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  SymbolInfo,
  IndicatorConfig,
  AlertItem,
  EconomicEvent,
  AccountState,
  Position,
  Order,
  BacktestResult,
  Candle,
  ThemeMode,
  DesktopTab,
  DesktopViewMode,
} from './types/trading';
import { INITIAL_CALENDAR } from './data/marketData';
import { useRealSymbols } from './hooks/useRealSymbols';
import { useOrderBook, type BookLevel } from './hooks/useOrderBook';
import { useTrades } from './hooks/useTrades';
import { useCandles } from './hooks/useCandles';
import type { OrderBookEntry } from './types/trading';
import type { SeriesRef } from './api/types';
import type { Period, SymbolInfo as ProSymbolInfo } from '@klinecharts/pro';
import { periodFromTimeframe, periodToTimeframe } from './api/datafeed';

const DEFAULT_SYMBOL: SymbolInfo = {
  id: 'BTCUSDT',
  ticker: 'BTCUSDT',
  name: 'Bitcoin / Tether Perpetual',
  exchange: 'USDT-FUTURES',
  category: 'crypto',
  price: 0,
  change24h: 0,
  change24hPercent: 0,
  high24h: 0,
  low24h: 0,
  volume24h: '-',
  digits: 2,
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  description: 'Bitcoin perpetual contract',
};

// Desktop Shell Components
import { DesktopTitleBar } from './components/desktop/DesktopTitleBar';
import { GlobalNavRail } from './components/desktop/GlobalNavRail';

// SuperCharts Components
import { NativeChart } from './components/chart/NativeChart';
import { RightDock } from './components/sidebar/RightDock';
import { BottomTimebar } from './components/timebar/BottomTimebar';
import { BottomDock } from './components/bottom/BottomDock';

// Dedicated Desktop Full Views
import { DashboardView } from './components/views/DashboardView';
import { MarketsView } from './components/views/MarketsView';
import { ScreenerView } from './components/views/ScreenerView';
import { HeatmapsView } from './components/views/HeatmapsView';
import { CommunityIdeasView } from './components/views/CommunityIdeasView';
import { NewsCalendarView } from './components/views/NewsCalendarView';
import { AgentView } from './components/views/AgentView';

// Modals & Overlays
import { CreateAlertModal } from './components/modals/CreateAlertModal';
import { OrderModal } from './components/modals/OrderModal';
import { CommandPaletteModal } from './components/modals/CommandPaletteModal';
import { KeyboardShortcutsModal } from './components/modals/KeyboardShortcutsModal';
import { DesktopSettingsModal } from './components/modals/DesktopSettingsModal';
import {
  syncAlertsFromServer,
  mirrorAlertCreate,
  mirrorAlertDelete,
  removeAlert,
  subscribeAlerts,
  upsertAlert,
  loadAlerts,
  type Alert,
} from './lib/alertsStore';
import { api } from './api/client';

/** Map a store Alert to the sidebar AlertItem shape. */
function alertToItem(a: Alert): AlertItem {
  return {
    id: a.id,
    symbol: a.symbol,
    condition: a.condition === 'below' ? 'Less Than' : 'Greater Than',
    targetPrice: a.threshold,
    createdAt: new Date(a.createdAt).toISOString().slice(0, 16),
    triggered: a.triggered,
    note: '',
    frequency: 'Every Time',
  };
}

export default function App() {
  // 1. Desktop Multi-Tab System
  const [tabs, setTabs] = useState<DesktopTab[]>([
    { id: 'tab-1', title: 'BTCUSDT.P', type: 'chart', symbol: 'BTCUSDT.P', isPinned: false },
    { id: 'tab-2', title: 'Markets', type: 'markets', isPinned: false },
    { id: 'tab-3', title: 'Screener 2.0', type: 'screener', isPinned: false },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');

  // Active workspace derived from active tab
  const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const isDashboard = currentTab?.type === 'dashboard';
  const activeView: DesktopViewMode = currentTab && currentTab.type !== 'dashboard' ? currentTab.type : 'chart';

  // 2. Symbol & Market State
  const { symbols: realSymbols, priceMap } = useRealSymbols();
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [activeSymbol, setActiveSymbol] = useState<SymbolInfo>(DEFAULT_SYMBOL);
  const [timeframe, setTimeframe] = useState<string>('1h');
  const [selectedRange, setSelectedRange] = useState<string>('1D');

  // Chart Scale Settings
  const [isLogScale, setIsLogScale] = useState<boolean>(false);
  const [isPercentScale, setIsPercentScale] = useState<boolean>(false);
  const [isAutoScale, setIsAutoScale] = useState<boolean>(true);

  // 3. Candlestick Data (real history + live via datafeed-backed hooks)
  const activeSeries: SeriesRef | null = useMemo(() => {
    if (!activeSymbol || activeSymbol === DEFAULT_SYMBOL) return null;
    return {
      category: 'USDT-FUTURES',
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
      setActiveSymbol(realSymbols.find((s) => s.id === 'BTCUSDT') ?? realSymbols[0]);
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
  const [theme, setTheme] = useState<ThemeMode>('dark');

  // 7. Secondary Layouts & Panels
  const [events] = useState<EconomicEvent[]>(INITIAL_CALENDAR);
  const rawBook = useOrderBook(activeSymbol?.id ?? 'BTCUSDT', 'USDT-FUTURES');
  const trades = useTrades(activeSymbol?.id ?? 'BTCUSDT', 'USDT-FUTURES');
  const orderBook: { bids: OrderBookEntry[]; asks: OrderBookEntry[]; spread: number | null } = useMemo(() => {
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

  // 8. Simulated Paper Trading State
  const [account, setAccount] = useState<AccountState>({
    balance: 50000,
    equity: 51240.5,
    unrealizedPnl: 1240.5,
    realizedPnl: 3820.0,
    usedMargin: 4820.0,
    freeMargin: 46420.5,
  });

  const [positions, setPositions] = useState<Position[]>([
    {
      id: 'pos-1',
      symbol: 'BTCUSDT.P',
      side: 'LONG',
      amount: 0.5,
      entryPrice: 95200.0,
      currentPrice: 96482.5,
      unrealizedPnl: 641.25,
      unrealizedPnlPercent: 1.35,
      margin: 4760.0,
      leverage: 10,
      tp: 98500.0,
      sl: 94000.0,
      timestamp: Date.now() - 3600000,
    },
    {
      id: 'pos-2',
      symbol: 'NVDA',
      side: 'LONG',
      amount: 50,
      entryPrice: 135.2,
      currentPrice: 138.65,
      unrealizedPnl: 172.5,
      unrealizedPnlPercent: 2.55,
      margin: 676.0,
      leverage: 10,
      timestamp: Date.now() - 1800000,
    },
  ]);

  const [orders, setOrders] = useState<Order[]>([
    {
      id: 'ord-1',
      symbol: 'SOLUSDT',
      side: 'BUY',
      type: 'LIMIT',
      price: 188.0,
      amount: 10,
      filled: 0,
      status: 'WORKING',
      leverage: 10,
      timestamp: Date.now() - 600000,
    },
  ]);

  // 9. Strategy Backtest Result
  const [backtestResult, setBacktestResult] = useState<BacktestResult>({
    strategyName: 'SuperTrend Dynamic Strategy v5',
    netProfit: 14820.5,
    netProfitPercent: 29.64,
    totalTrades: 84,
    winningTrades: 54,
    losingTrades: 30,
    winRate: 64.28,
    profitFactor: 2.14,
    maxDrawdown: 1840.0,
    maxDrawdownPercent: 3.68,
    sharpeRatio: 1.88,
    trades: [
      { id: 't1', type: 'LONG', entryTime: '2025-02-10 14:00', exitTime: '2025-02-11 09:30', entryPrice: 94200, exitPrice: 96100, pnl: 950, pnlPercent: 2.01, size: 0.5, reason: 'Take Profit' },
      { id: 't2', type: 'SHORT', entryTime: '2025-02-12 16:00', exitTime: '2025-02-13 11:15', entryPrice: 96400, exitPrice: 95300, pnl: 550, pnlPercent: 1.14, size: 0.5, reason: 'SuperTrend Reversal' },
      { id: 't3', type: 'LONG', entryTime: '2025-02-14 08:00', exitTime: '2025-02-14 15:45', entryPrice: 95100, exitPrice: 94800, pnl: -150, pnlPercent: -0.31, size: 0.5, reason: 'Trailing Stop' },
    ],
    equityCurve: [
      { time: 'Day 1', equity: 100000 },
      { time: 'Day 5', equity: 102400 },
      { time: 'Day 10', equity: 101800 },
      { time: 'Day 15', equity: 106500 },
      { time: 'Day 20', equity: 109200 },
      { time: 'Day 25', equity: 114820 },
    ],
  });

  // 10. Modals State
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

  const [orderModal, setOrderModal] = useState<{ isOpen: boolean; side: 'BUY' | 'SELL' }>({
    isOpen: false,
    side: 'BUY',
  });

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

  const handleNewTab = (type: DesktopViewMode | 'dashboard', symbolTicker?: string) => {
    const newId = `tab-${Date.now()}`;
    let title = 'SuperCharts';
    if (type === 'chart') title = symbolTicker || activeSymbol.ticker;
    else if (type === 'markets') title = 'Markets';
    else if (type === 'screener') title = 'Screener';
    else if (type === 'heatmaps') title = 'Heatmaps';
    else if (type === 'community') title = 'Community';
    else if (type === 'news') title = 'News';
    else if (type === 'agent') title = 'AI Agent';
    else if (type === 'dashboard') title = 'Dashboard';

    const newTab: DesktopTab = {
      id: newId,
      title,
      type,
      symbol: symbolTicker || (type === 'chart' ? activeSymbol.ticker : undefined),
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
                type === 'chart'
                  ? t.symbol || activeSymbol.ticker
                  : type === 'markets'
                  ? 'Markets'
                  : type === 'screener'
                  ? 'Screener'
                  : type === 'heatmaps'
                  ? 'Heatmaps'
                  : type === 'community'
                  ? 'Community'
                  : type === 'agent'
                  ? 'AI Agent'
                  : 'News',
              symbol: type === 'chart' ? t.symbol || activeSymbol.ticker : undefined,
            }
          : t
      )
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
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isPinned: !t.isPinned } : t))
    );
  };

  // Open Chart with specific Symbol from other views
  const handleOpenChartWithSymbol = (sym: SymbolInfo) => {
    setActiveSymbol(sym);
    // Find chart tab or update current tab
    const chartTab = tabs.find((t) => t.type === 'chart');
    if (chartTab) {
      setTabs((prev) =>
        prev.map((t) => (t.id === chartTab.id ? { ...t, title: sym.ticker, symbol: sym.ticker } : t))
      );
      setActiveTabId(chartTab.id);
    } else {
      handleNewTab('chart', sym.ticker);
    }
  };

  const handleOpenChartWithTicker = (ticker: string) => {
    const match = symbols.find((s) => s.ticker.toUpperCase() === ticker.toUpperCase() || s.id.toUpperCase() === ticker.toUpperCase());
    if (match) {
      handleOpenChartWithSymbol(match);
    } else {
      // Create transient symbol if not found
      const newSym: SymbolInfo = {
        id: ticker.toUpperCase(),
        ticker: ticker.toUpperCase(),
        name: `${ticker.toUpperCase()} Asset`,
        exchange: 'GLOBAL',
        category: 'crypto',
        price: 100.0,
        change24h: 2.5,
        change24hPercent: 2.5,
        high24h: 105.0,
        low24h: 98.0,
        volume24h: '$120M',
        digits: 2,
        baseAsset: ticker.toUpperCase(),
        quoteAsset: 'USD',
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
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      // Command Palette (⌘K / Ctrl+K)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }

      // New Tab (⌘T / Ctrl+T)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        handleNewTab('chart');
      }

      // Close Tab (⌘W / Ctrl+W)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        handleCloseTab(activeTabId);
      }

      // Question Mark (?) -> Shortcuts Modal
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
      }

      // Space -> Next Symbol in watchlist
      if (e.key === ' ' && !e.shiftKey) {
        e.preventDefault();
        const currIdx = symbols.findIndex((s) => s.id === activeSymbol.id);
        const nextIdx = (currIdx + 1) % symbols.length;
        handleSelectSymbol(symbols[nextIdx]);
      }

      // Shift + Space -> Prev Symbol
      if (e.key === ' ' && e.shiftKey) {
        e.preventDefault();
        const currIdx = symbols.findIndex((s) => s.id === activeSymbol.id);
        const prevIdx = (currIdx - 1 + symbols.length) % symbols.length;
        handleSelectSymbol(symbols[prevIdx]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSymbol.id, symbols, activeTabId]);

  // Handlers
  const handleSelectSymbol = (sym: SymbolInfo) => {
    setActiveSymbol(sym);
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId && t.type === 'chart' ? { ...t, title: sym.ticker, symbol: sym.ticker } : t))
    );
  };

  // Native klinecharts-pro symbol change (from its built-in symbol search):
  // map the pro SymbolInfo back to the shell SymbolInfo so the right dock
  // (order book / trades / data window) follows the chart.
  const handleNativeSymbolChange = useCallback((ps: ProSymbolInfo) => {
    const ticker = ps.ticker;
    setActiveSymbol((prev) => {
      if (prev && prev.id === ticker) return prev;
      return {
        id: ticker,
        ticker,
        name: ps.name ?? ticker,
        exchange: ps.exchange ?? ps.market ?? 'USDT-FUTURES',
        category: 'crypto',
        price: 0,
        change24h: 0,
        change24hPercent: 0,
        high24h: 0,
        low24h: 0,
        volume24h: '-',
        digits: ps.pricePrecision ?? 2,
        baseAsset: ticker.replace(/USDT|USDC$/, ''),
        quoteAsset: 'USDT',
        description: '',
      };
    });
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId && t.type === 'chart' ? { ...t, title: ticker, symbol: ticker } : t
      )
    );
  }, [activeTabId]);

  // Native period-bar change -> keep shell timeframe in sync (DataWindow etc.).
  const handleNativePeriodChange = useCallback((p: Period) => {
    setTimeframe(periodToTimeframe(p));
  }, []);

  const handleClosePosition = (id: string) => {
    const pos = positions.find((p) => p.id === id);
    if (!pos) return;
    setAccount((prev) => ({
      ...prev,
      balance: prev.balance + pos.unrealizedPnl,
      realizedPnl: prev.realizedPnl + pos.unrealizedPnl,
      usedMargin: Math.max(0, prev.usedMargin - pos.margin),
      freeMargin: prev.freeMargin + pos.margin + pos.unrealizedPnl,
    }));
    setPositions((prev) => prev.filter((p) => p.id !== id));
  };

  const handleCancelOrder = (id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const handlePlaceOrder = (orderData: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT';
    price: number;
    amount: number;
    leverage: number;
    tp?: number;
    sl?: number;
  }) => {
    const symbol = activeSymbol.id || orderData.symbol;
    const side = orderData.side === 'BUY' ? 'long' : 'short';
    const orderCost = (orderData.price * orderData.amount) / orderData.leverage;

    // Two-phase order flow through the backend risk gate (paper broker).
    api
      .order({ category: 'USDT-FUTURES', symbol, side, leverage: orderData.leverage, price: orderData.price })
      .then(({ token }) => api.orderConfirm(token))
      .then((res) => {
        if (!res.approved) return;
        if (orderData.type === 'MARKET') {
          const newPos: Position = {
            id: `pos-${Date.now()}`,
            symbol,
            side: orderData.side === 'BUY' ? 'LONG' : 'SHORT',
            amount: orderData.amount,
            entryPrice: orderData.price,
            currentPrice: orderData.price,
            unrealizedPnl: 0,
            unrealizedPnlPercent: 0,
            margin: orderCost,
            leverage: orderData.leverage,
            tp: orderData.tp,
            sl: orderData.sl,
            timestamp: Date.now(),
          };
          setPositions((prev) => [newPos, ...prev]);
          setAccount((prev) => ({
            ...prev,
            usedMargin: prev.usedMargin + orderCost,
            freeMargin: Math.max(0, prev.freeMargin - orderCost),
          }));
        } else {
          const newOrd: Order = {
            id: `ord-${Date.now()}`,
            symbol,
            side: orderData.side,
            type: 'LIMIT',
            price: orderData.price,
            amount: orderData.amount,
            filled: 0,
            status: 'WORKING',
            leverage: orderData.leverage,
            timestamp: Date.now(),
          };
          setOrders((prev) => [newOrd, ...prev]);
        }
      })
      .catch(() => {
        /* order rejected by risk gate or backend offline; keep UI unchanged */
      });
  };

  // Resets the simulated paper account to its initial state. Its only caller was the
  // brokers view, which was removed; retained for a future paper-trading UI (do not delete).
  const handleResetPaperAccount = () => {
    setAccount({
      balance: 50000,
      equity: 50000,
      unrealizedPnl: 0,
      realizedPnl: 0,
      usedMargin: 0,
      freeMargin: 50000,
    });
    setPositions([]);
    setOrders([]);
  };

  // Backend strategy backtest trigger (POST /backtest + GET /jobs/{job_id} polling).
  // Pine Studio & bottom-dock Pine editor views were removed; this function currently
  // has NO callers but is retained as the backend backtest entry point for a future
  // strategy configuration UI (do not delete).
  const handleRunStrategy = (_scriptCode: string, scriptName: string) => {
    const symbol = activeSymbol.id || 'BTCUSDT';
    const series: SeriesRef = { category: 'USDT-FUTURES', symbol, timeframe: '1h' };
    api
      .backtest(series)
      .then(async ({ job_id }) => {
        // Poll the background job until done/error.
        let result: Record<string, unknown> | null = null;
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 500));
          const job = await api.job(job_id);
          if (job.status === 'done') {
            result = job.result as Record<string, unknown>;
            break;
          }
          if (job.status === 'error') break;
        }
        const metrics = (result?.metrics ?? result ?? {}) as Record<string, number | string>;
        const toNum = (v: unknown, d = 0): number => {
          const n = Number(v);
          return Number.isNaN(n) ? d : n;
        };
        const totalTrades = Math.round(toNum(metrics.trades, 0));
        const winRate = toNum(metrics.win_rate, 0) * 100;
        const winningTrades = Math.round((totalTrades * winRate) / 100);
        setBacktestResult({
          strategyName: scriptName || 'DL Quant Strategy',
          netProfit: toNum(metrics.net_profit, 0),
          netProfitPercent: toNum(metrics.net_profit_pct, 0),
          totalTrades,
          winningTrades,
          losingTrades: totalTrades - winningTrades,
          winRate,
          profitFactor: toNum(metrics.profit_factor, 1),
          maxDrawdown: toNum(metrics.max_drawdown, 0),
          maxDrawdownPercent: toNum(metrics.max_drawdown_pct, 0),
          sharpeRatio: toNum(metrics.sharpe, 0),
          trades: [],
          equityCurve: [],
        });
      })
      .catch(() => {
        /* backend backtest unavailable; leave last result unchanged */
      });
  };

  const activeCandle = candles[candles.length - 1] || null;

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
      id="tradingview-desktop-root"
      className={`flex flex-col h-screen w-screen overflow-hidden font-sans select-none ${
        theme === 'dark' ? 'bg-[#131722] text-[#d1d4dc]' : 'bg-[#f0f3fa] text-[#131722]'
      }`}
    >
      {/* 1. BeyondEther Desktop Top TitleBar & Multi-Tab Manager */}
      <DesktopTitleBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        onPinTab={handlePinTab}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenDesktopSettings={() => setIsDesktopSettingsOpen(true)}
        onOpenShortcutsModal={() => setIsShortcutsOpen(true)}
      />

      {/* 2. Main Desktop Client Body: Global Left Rail + Active Workspace View */}
      <div className="flex flex-1 w-full overflow-hidden relative">
        {/* Global Primary Navigation Rail */}
        <GlobalNavRail
          activeView={activeView}
          onSelectView={handleSelectGlobalRailView}
          theme={theme}
          onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onOpenShortcuts={() => setIsShortcutsOpen(true)}
          onOpenSettings={() => setIsDesktopSettingsOpen(true)}
          onOpenAlertModal={() => setIsAlertOpen(true)}
          onOpenOrderModal={(side) => setOrderModal({ isOpen: true, side })}
        />

        {/* Dynamic Workspace Router */}
        <main className="flex flex-col flex-1 h-full overflow-hidden relative">
          {isDashboard && (
            <DashboardView
              theme={theme}
              onOpen={(type) => handlePromoteTab(type)}
            />
          )}

          {!isDashboard && activeView === 'chart' && (
            <div
              ref={chartWorkspaceRef}
              className={`flex flex-col h-full w-full ${
                bottomOpen ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'
              }`}
            >
              {/* Chart Main Layout Area */}
              <div
                className={`flex w-full overflow-hidden relative transition-all ${
                  bottomOpen ? 'min-h-full flex-none' : 'flex-1'
                }`}
              >
                {/* Central native klinecharts-pro chart */}
                <div className="flex flex-col flex-1 h-full overflow-hidden relative">
                  <NativeChart
                    symbol={activeSymbol}
                    timeframe={timeframe}
                    theme={theme}
                    onSymbolChange={handleNativeSymbolChange}
                    onPeriodChange={handleNativePeriodChange}
                    onCreateAlertAt={handleCreateAlertAt}
                  />

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
                  onAddSymbol={() => {}}
                  activeCandle={activeCandle}
                  indicators={indicators}
                  alerts={alerts}
                  onRemoveAlert={(id) => {
  setAlerts((prev) => prev.filter((a) => a.id !== id));
  removeAlert(id);
  mirrorAlertDelete(id);
}}
                  onOpenCreateAlert={() => setIsAlertOpen(true)}
                  events={events}
                  orderBook={orderBook}
                  trades={trades}
                  theme={theme}
                />
              </div>

              {/* Bottom Dock (Pine Editor, Strategy Tester, Paper Trading Terminal, Screener, Text Notes) */}
              <BottomDock
                symbol={activeSymbol}
                symbols={symbols}
                onSelectSymbol={handleSelectSymbol}
                account={account}
                positions={positions}
                orders={orders}
                onClosePosition={handleClosePosition}
                onCancelOrder={handleCancelOrder}
                onOpenOrderModal={(side) => setOrderModal({ isOpen: true, side })}
                backtestResult={backtestResult}
                onOpenChange={setBottomOpen}
                theme={theme}
              />
            </div>
          )}

          {activeView === 'markets' && (
            <MarketsView
              theme={theme}
            />
          )}

          {activeView === 'screener' && (
            <ScreenerView
              symbols={symbols}
              onOpenChartWithTicker={handleOpenChartWithTicker}
              theme={theme}
            />
          )}

          {activeView === 'heatmaps' && (
            <HeatmapsView
              onOpenChartWithTicker={handleOpenChartWithTicker}
              theme={theme}
            />
          )}

          {activeView === 'community' && (
            <CommunityIdeasView
              onOpenChartWithTicker={handleOpenChartWithTicker}
              theme={theme}
            />
          )}

          {activeView === 'news' && (
            <NewsCalendarView
              onOpenChartWithTicker={handleOpenChartWithTicker}
              theme={theme}
            />
          )}

          {activeView === 'agent' && (
            <AgentView
              symbols={symbols}
              theme={theme}
            />
          )}
        </main>
      </div>

      {/* 3. Global Modals & Overlays */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        symbols={symbols}
        onSelectSymbol={handleSelectSymbol}
        onSelectView={handleSelectGlobalRailView}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
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
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
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
    condition: newAlt.condition.includes('Less') ? 'below' : 'above',
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

      <OrderModal
        isOpen={orderModal.isOpen}
        onClose={() => setOrderModal({ ...orderModal, isOpen: false })}
        symbol={activeSymbol}
        initialSide={orderModal.side}
        onSubmitOrder={handlePlaceOrder}
        theme={theme}
      />
    </div>
  );
}
