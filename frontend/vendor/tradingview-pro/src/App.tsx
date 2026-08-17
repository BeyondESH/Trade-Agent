import React, { useState, useEffect, useCallback } from 'react';
import {
  SymbolInfo,
  Timeframe,
  ChartType,
  DrawingToolType,
  Drawing,
  IndicatorConfig,
  AlertItem,
  NewsItem,
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
import {
  INITIAL_SYMBOLS,
  generateHistoricalCandles,
  generateOrderBook,
  INITIAL_NEWS,
  INITIAL_CALENDAR,
} from './data/marketData';

// Desktop Shell Components
import { DesktopTitleBar } from './components/desktop/DesktopTitleBar';
import { GlobalNavRail } from './components/desktop/GlobalNavRail';

// SuperCharts Components
import { TopNavbar } from './components/header/TopNavbar';
import { ReplayBar } from './components/header/ReplayBar';
import { DrawingToolbar } from './components/chart/DrawingToolbar';
import { MultiChartGrid } from './components/chart/MultiChartGrid';
import { RightDock } from './components/sidebar/RightDock';
import { BottomTimebar } from './components/timebar/BottomTimebar';
import { BottomDock } from './components/bottom/BottomDock';

// Dedicated Desktop Full Views
import { MarketsView } from './components/views/MarketsView';
import { ScreenerView } from './components/views/ScreenerView';
import { HeatmapsView } from './components/views/HeatmapsView';
import { CommunityIdeasView } from './components/views/CommunityIdeasView';
import { NewsCalendarView } from './components/views/NewsCalendarView';
import { PineStudioView } from './components/views/PineStudioView';
import { BrokersView } from './components/views/BrokersView';

// Modals & Overlays
import { SymbolSearchModal } from './components/modals/SymbolSearchModal';
import { IndicatorsModal } from './components/modals/IndicatorsModal';
import { ChartSettingsModal } from './components/modals/ChartSettingsModal';
import { CreateAlertModal } from './components/modals/CreateAlertModal';
import { OrderModal } from './components/modals/OrderModal';
import { SnapshotModal } from './components/modals/SnapshotModal';
import { CommandPaletteModal } from './components/modals/CommandPaletteModal';
import { KeyboardShortcutsModal } from './components/modals/KeyboardShortcutsModal';
import { DesktopSettingsModal } from './components/modals/DesktopSettingsModal';

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
  const activeView: DesktopViewMode = currentTab?.type || 'chart';

  // 2. Symbol & Market State
  const [symbols, setSymbols] = useState<SymbolInfo[]>(INITIAL_SYMBOLS);
  const [activeSymbol, setActiveSymbol] = useState<SymbolInfo>(INITIAL_SYMBOLS[0]);
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [chartType, setChartType] = useState<ChartType>('candles');
  const [selectedRange, setSelectedRange] = useState<string>('1D');

  // Chart Scale Settings
  const [isLogScale, setIsLogScale] = useState<boolean>(false);
  const [isPercentScale, setIsPercentScale] = useState<boolean>(false);
  const [isAutoScale, setIsAutoScale] = useState<boolean>(true);

  // 3. Candlestick Data
  const [candles, setCandles] = useState<Candle[]>(() =>
    generateHistoricalCandles(INITIAL_SYMBOLS[0], '1h', 300)
  );

  // 4. Technical Indicators
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([
    {
      id: 'ema20',
      name: 'EMA 20',
      shortName: 'EMA 20',
      type: 'overlay',
      visible: true,
      color: '#2962ff',
      params: { length: 20 },
    },
    {
      id: 'ema50',
      name: 'EMA 50',
      shortName: 'EMA 50',
      type: 'overlay',
      visible: true,
      color: '#ff9800',
      params: { length: 50 },
    },
    {
      id: 'bb',
      name: 'Bollinger Bands (20, 2)',
      shortName: 'BB',
      type: 'overlay',
      visible: false,
      color: '#2962ff',
      params: { length: 20, mult: 2 },
    },
    {
      id: 'rsi',
      name: 'RSI (14)',
      shortName: 'RSI 14',
      type: 'pane',
      visible: true,
      color: '#e040fb',
      params: { length: 14 },
    },
    {
      id: 'macd',
      name: 'MACD (12, 26, 9)',
      shortName: 'MACD',
      type: 'pane',
      visible: false,
      color: '#2962ff',
      params: { fast: 12, slow: 26, signal: 9 },
    },
  ]);

  // 5. Drawings
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeTool, setActiveTool] = useState<DrawingToolType>('crosshair');
  const [magnetMode, setMagnetMode] = useState<boolean>(false);
  const [lockAll, setLockAll] = useState<boolean>(false);
  const [hideAll, setHideAll] = useState<boolean>(false);

  // 6. Theme & Layout
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [activeLayout, setActiveLayout] = useState<string>('1x1');

  // 7. Secondary Layouts & Panels
  const [news] = useState<NewsItem[]>(INITIAL_NEWS);
  const [events] = useState<EconomicEvent[]>(INITIAL_CALENDAR);
  const [orderBook, setOrderBook] = useState(() =>
    generateOrderBook(INITIAL_SYMBOLS[0].price, INITIAL_SYMBOLS[0].digits)
  );
  const [alerts, setAlerts] = useState<AlertItem[]>([
    {
      id: 'alt-1',
      symbol: 'BTCUSDT.P',
      condition: 'Crossing Up',
      targetPrice: 98000,
      createdAt: '1h ago',
      triggered: false,
      note: 'Key breakout level above previous high',
      frequency: 'Only Once',
    },
    {
      id: 'alt-2',
      symbol: 'NVDA',
      condition: 'Crossing',
      targetPrice: 140,
      createdAt: '3h ago',
      triggered: false,
      note: 'Resistance test watch',
      frequency: 'Every Time',
    },
  ]);

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

  // 10. Replay Mode State
  const [isReplayActive, setIsReplayActive] = useState<boolean>(false);
  const [replayIndex, setReplayIndex] = useState<number>(200);
  const [isReplayPlaying, setIsReplayPlaying] = useState<boolean>(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);

  // 11. Modals State
  const [isSymbolSearchOpen, setIsSymbolSearchOpen] = useState(false);
  const [isIndicatorsOpen, setIsIndicatorsOpen] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);
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

  const handleNewTab = (type: DesktopViewMode, symbolTicker?: string) => {
    const newId = `tab-${Date.now()}`;
    let title = 'SuperCharts';
    if (type === 'chart') title = symbolTicker || activeSymbol.ticker;
    else if (type === 'markets') title = 'Markets';
    else if (type === 'screener') title = 'Screener';
    else if (type === 'heatmaps') title = 'Heatmaps';
    else if (type === 'community') title = 'Community';
    else if (type === 'news') title = 'News';
    else if (type === 'pine') title = 'Pine Studio';
    else if (type === 'brokers') title = 'Brokers';

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

  // Regenerate candles when Symbol or Timeframe changes
  useEffect(() => {
    const freshCandles = generateHistoricalCandles(activeSymbol, timeframe, 300);
    setCandles(freshCandles);
    setOrderBook(generateOrderBook(activeSymbol.price, activeSymbol.digits));
    if (isReplayActive) {
      setReplayIndex(Math.floor(freshCandles.length * 0.7));
    }
  }, [activeSymbol.id, timeframe]);

  // Real-time market tick generator simulation
  useEffect(() => {
    const interval = setInterval(() => {
      if (isReplayActive && !isReplayPlaying) return;

      const tickDelta = (Math.random() - 0.49) * activeSymbol.price * 0.0006;
      const newPrice = Number((activeSymbol.price + tickDelta).toFixed(activeSymbol.digits));

      setActiveSymbol((prev) => {
        const pDiff = newPrice - (prev.price - prev.change24h);
        const pDiffPct = (pDiff / (prev.price - prev.change24h || 1)) * 100;
        return {
          ...prev,
          price: newPrice,
          change24h: Number(pDiff.toFixed(prev.digits)),
          change24hPercent: Number(pDiffPct.toFixed(2)),
          high24h: Math.max(prev.high24h, newPrice),
          low24h: Math.min(prev.low24h, newPrice),
        };
      });

      setSymbols((prev) =>
        prev.map((s) => (s.id === activeSymbol.id ? { ...s, price: newPrice } : s))
      );

      setOrderBook(generateOrderBook(newPrice, activeSymbol.digits));

      setCandles((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const updatedLast: Candle = {
          ...last,
          close: newPrice,
          high: Math.max(last.high, newPrice),
          low: Math.min(last.low, newPrice),
          volume: last.volume + Math.floor(Math.random() * 5),
        };
        return [...prev.slice(0, -1), updatedLast];
      });

      setPositions((prev) =>
        prev.map((pos) => {
          if (pos.symbol === activeSymbol.ticker) {
            const priceDiff =
              pos.side === 'LONG' ? newPrice - pos.entryPrice : pos.entryPrice - newPrice;
            const pnl = priceDiff * pos.amount;
            const pnlPercent = (priceDiff / pos.entryPrice) * 100 * pos.leverage;
            return {
              ...pos,
              currentPrice: newPrice,
              unrealizedPnl: Number(pnl.toFixed(2)),
              unrealizedPnlPercent: Number(pnlPercent.toFixed(2)),
            };
          }
          return pos;
        })
      );
    }, 1200);

    return () => clearInterval(interval);
  }, [activeSymbol.id, activeSymbol.price, activeSymbol.digits, isReplayActive, isReplayPlaying]);

  // Replay tick step
  useEffect(() => {
    if (!isReplayActive || !isReplayPlaying) return;
    const timer = setInterval(() => {
      setReplayIndex((prev) => {
        if (prev >= candles.length - 1) {
          setIsReplayPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1000 / replaySpeed);

    return () => clearInterval(timer);
  }, [isReplayActive, isReplayPlaying, replaySpeed, candles.length]);

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

      // Indicator Search (/)
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsIndicatorsOpen(true);
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

  const handleToggleIndicator = (id: string) => {
    setIndicators((prev) =>
      prev.map((ind) => (ind.id === id ? { ...ind, visible: !ind.visible } : ind))
    );
  };

  const handleRemoveIndicator = (id: string) => {
    setIndicators((prev) => prev.filter((ind) => ind.id !== id));
  };

  const handleAddCustomIndicator = (newInd: IndicatorConfig) => {
    setIndicators((prev) => {
      const exists = prev.find((i) => i.id === newInd.id);
      if (exists) {
        return prev.map((i) => (i.id === newInd.id ? { ...i, visible: true } : i));
      }
      return [...prev, newInd];
    });
  };

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
    const orderCost = (orderData.price * orderData.amount) / orderData.leverage;

    if (orderData.type === 'MARKET') {
      const newPos: Position = {
        id: `pos-${Date.now()}`,
        symbol: orderData.symbol,
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
        symbol: orderData.symbol,
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
  };

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

  const handleRunStrategy = (_scriptCode: string, scriptName: string) => {
    const profit = Math.floor(Math.random() * 8000 + 4000);
    const winRate = Number((Math.random() * 25 + 52).toFixed(1));
    const totalTrades = Math.floor(Math.random() * 60 + 40);
    const winningTrades = Math.round((totalTrades * winRate) / 100);
    const losingTrades = totalTrades - winningTrades;

    setBacktestResult({
      strategyName: scriptName || 'Custom Pine Script',
      netProfit: profit,
      netProfitPercent: Number(((profit / 50000) * 100).toFixed(2)),
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      profitFactor: Number((Math.random() * 1.2 + 1.4).toFixed(2)),
      maxDrawdown: Math.floor(Math.random() * 1200 + 800),
      maxDrawdownPercent: Number((Math.random() * 3 + 2).toFixed(2)),
      sharpeRatio: Number((Math.random() * 0.8 + 1.4).toFixed(2)),
      trades: [
        {
          id: `t-${Date.now()}-1`,
          type: 'LONG',
          entryTime: '2025-02-15 10:00',
          exitTime: '2025-02-16 16:30',
          entryPrice: activeSymbol.price * 0.98,
          exitPrice: activeSymbol.price,
          pnl: 850,
          pnlPercent: 2.04,
          size: 0.5,
          reason: 'Take Profit',
        },
        {
          id: `t-${Date.now()}-2`,
          type: 'SHORT',
          entryTime: '2025-02-14 11:30',
          exitTime: '2025-02-15 09:15',
          entryPrice: activeSymbol.price * 1.02,
          exitPrice: activeSymbol.price * 0.99,
          pnl: 620,
          pnlPercent: 1.48,
          size: 0.5,
          reason: 'Signal Exit',
        },
      ],
      equityCurve: [
        { time: 'Day 1', equity: 100000 },
        { time: 'Day 10', equity: 104500 },
        { time: 'Day 20', equity: 109200 },
        { time: 'Day 30', equity: 100000 + profit },
      ],
    });
  };

  const handleApplyScriptFromStudio = (scriptCode: string, scriptName: string) => {
    handleRunStrategy(scriptCode, scriptName);
    // Switch to chart tab to view results
    const chartTab = tabs.find((t) => t.type === 'chart');
    if (chartTab) {
      setActiveTabId(chartTab.id);
    } else {
      handleNewTab('chart');
    }
  };

  const activeCandle = candles[candles.length - 1] || null;

  return (
    <div
      id="tradingview-desktop-root"
      className={`flex flex-col h-screen w-screen overflow-hidden font-sans select-none ${
        theme === 'dark' ? 'bg-[#131722] text-[#d1d4dc]' : 'bg-[#f0f3fa] text-[#131722]'
      }`}
    >
      {/* 1. TradingView Desktop Top TitleBar & Multi-Tab Manager */}
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
        />

        {/* Dynamic Workspace Router */}
        <main className="flex flex-col flex-1 h-full overflow-hidden relative">
          {activeView === 'chart' && (
            <div className="flex flex-col h-full w-full overflow-hidden">
              {/* Top Chart Header Toolbar */}
              <TopNavbar
                symbol={activeSymbol}
                timeframe={timeframe}
                onChangeTimeframe={setTimeframe}
                chartType={chartType}
                onChangeChartType={setChartType}
                onOpenSymbolSearch={() => setIsSymbolSearchOpen(true)}
                onOpenIndicatorsModal={() => setIsIndicatorsOpen(true)}
                onOpenAlertModal={() => setIsAlertOpen(true)}
                onOpenSettingsModal={() => setIsSettingsOpen(true)}
                onOpenSnapshotModal={() => setIsSnapshotOpen(true)}
                onToggleReplay={() => setIsReplayActive(!isReplayActive)}
                isReplayActive={isReplayActive}
                theme={theme}
                onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                onOpenOrderModal={(side) => setOrderModal({ isOpen: true, side })}
                activeLayout={activeLayout}
                onChangeLayout={setActiveLayout}
              />

              {/* Replay Controller (When Active) */}
              {isReplayActive && (
                <ReplayBar
                  isPlaying={isReplayPlaying}
                  onTogglePlay={() => setIsReplayPlaying(!isReplayPlaying)}
                  onStepForward={() => setReplayIndex((prev) => Math.min(candles.length - 1, prev + 1))}
                  onReset={() => setReplayIndex(Math.floor(candles.length * 0.5))}
                  speed={replaySpeed}
                  onChangeSpeed={setReplaySpeed}
                  onClose={() => {
                    setIsReplayActive(false);
                    setIsReplayPlaying(false);
                  }}
                  theme={theme}
                />
              )}

              {/* Chart Main Layout Area */}
              <div className="flex flex-1 w-full overflow-hidden relative">
                {/* Left Drawing Tools Toolbar */}
                <DrawingToolbar
                  activeTool={activeTool}
                  onSelectTool={setActiveTool}
                  magnetMode={magnetMode}
                  onToggleMagnet={() => setMagnetMode(!magnetMode)}
                  lockAll={lockAll}
                  onToggleLockAll={() => setLockAll(!lockAll)}
                  hideAll={hideAll}
                  onToggleHideAll={() => setHideAll(!hideAll)}
                  onClearDrawings={() => setDrawings([])}
                  theme={theme}
                />

                {/* Central Multi-Chart Grid / Canvas */}
                <div className="flex flex-col flex-1 h-full overflow-hidden relative">
                  <MultiChartGrid
                    activeSymbol={activeSymbol}
                    symbols={symbols}
                    timeframe={timeframe}
                    chartType={chartType}
                    candles={candles}
                    activeTool={activeTool}
                    onToolUsed={() => setActiveTool('crosshair')}
                    indicators={indicators}
                    onToggleIndicator={handleToggleIndicator}
                    onRemoveIndicator={handleRemoveIndicator}
                    drawings={drawings}
                    onUpdateDrawings={setDrawings}
                    magnetMode={magnetMode}
                    lockAll={lockAll}
                    hideAll={hideAll}
                    theme={theme}
                    layout={activeLayout}
                    isReplayActive={isReplayActive}
                    replayIndex={replayIndex}
                    onOpenOrderModal={(side) => setOrderModal({ isOpen: true, side })}
                    onOpenSymbolSearch={() => setIsSymbolSearchOpen(true)}
                    onSelectSymbol={handleSelectSymbol}
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
                  onAddSymbol={() => setIsSymbolSearchOpen(true)}
                  activeCandle={activeCandle}
                  indicators={indicators}
                  alerts={alerts}
                  onRemoveAlert={(id) => setAlerts((prev) => prev.filter((a) => a.id !== id))}
                  onOpenCreateAlert={() => setIsAlertOpen(true)}
                  news={news}
                  events={events}
                  orderBook={orderBook}
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
                onRunStrategy={handleRunStrategy}
                theme={theme}
              />
            </div>
          )}

          {activeView === 'markets' && (
            <MarketsView
              symbols={symbols}
              onSelectSymbol={handleSelectSymbol}
              onOpenChartWithSymbol={handleOpenChartWithSymbol}
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

          {activeView === 'pine' && (
            <PineStudioView
              onApplyScriptToChart={handleApplyScriptFromStudio}
              theme={theme}
            />
          )}

          {activeView === 'brokers' && (
            <BrokersView
              account={account}
              positions={positions}
              orders={orders}
              onResetPaperAccount={handleResetPaperAccount}
              onOpenOrderModal={(side) => setOrderModal({ isOpen: true, side })}
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

      <SymbolSearchModal
        isOpen={isSymbolSearchOpen}
        onClose={() => setIsSymbolSearchOpen(false)}
        symbols={symbols}
        onSelectSymbol={handleSelectSymbol}
        theme={theme}
      />

      <IndicatorsModal
        isOpen={isIndicatorsOpen}
        onClose={() => setIsIndicatorsOpen(false)}
        indicators={indicators}
        onToggleIndicator={handleToggleIndicator}
        onAddCustomIndicator={handleAddCustomIndicator}
        theme={theme}
      />

      <ChartSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
      />

      <CreateAlertModal
        isOpen={isAlertOpen}
        onClose={() => setIsAlertOpen(false)}
        symbol={activeSymbol}
        onAddAlert={(newAlt) => setAlerts((prev) => [newAlt, ...prev])}
        theme={theme}
      />

      <OrderModal
        isOpen={orderModal.isOpen}
        onClose={() => setOrderModal({ ...orderModal, isOpen: false })}
        symbol={activeSymbol}
        initialSide={orderModal.side}
        onSubmitOrder={handlePlaceOrder}
        theme={theme}
      />

      <SnapshotModal
        isOpen={isSnapshotOpen}
        onClose={() => setIsSnapshotOpen(false)}
        symbol={activeSymbol}
        theme={theme}
      />
    </div>
  );
}
