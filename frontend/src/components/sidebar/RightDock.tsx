import {
  BarChart3,
  Bell,
  Bookmark,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flame,
  Layers,
  MessageSquare,
  Newspaper,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { Trade } from "../../hooks/useTrades";
import { t } from "../../lib/i18n";
import {
  type AlertItem,
  type Candle,
  type EconomicEvent,
  type IndicatorConfig,
  NewsItem,
  type OrderBookEntry,
  type SymbolInfo,
} from "../../types/trading";
import { AlertsPanel } from "./AlertsPanel";
import { CalendarPanel } from "./CalendarPanel";
import { CommunityIdeasPanel } from "./CommunityIdeasPanel";
import { DataWindowPanel } from "./DataWindowPanel";
import { HotlistsPanel } from "./HotlistsPanel";
import { NewsPanel } from "./NewsPanel";
import { OrderBookPanel } from "./OrderBookPanel";
import { TradesTape } from "./TradesTape";
import { WatchlistPanel } from "./WatchlistPanel";
import { loadDockWidth, saveDockWidth, widthFromDrag } from "./rightDockWidth";

interface Props {
  symbols: SymbolInfo[];
  activeSymbol: SymbolInfo;
  onSelectSymbol: (symbol: SymbolInfo) => void;
  onAddSymbol: () => void;
  activeCandle: Candle | null;
  indicators: IndicatorConfig[];
  alerts: AlertItem[];
  onRemoveAlert: (id: string) => void;
  onToggleAlert: (id: string, enabled: boolean) => void;
  onResetAlert: (id: string) => void;
  notifyEnabled: boolean;
  onToggleNotifications: () => void;
  onOpenCreateAlert: () => void;
  events: EconomicEvent[];
  orderBook: {
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
    spread: number | null;
  };
  trades: Trade[];
  theme: "dark" | "light";
}
type TabType =
  | "watchlist"
  | "alerts"
  | "news"
  | "datawindow"
  | "hotlists"
  | "calendar"
  | "orderbook"
  | "ideas";

/** The resize grabber is visually a hairline but hit-tested 7px wide. */
const HANDLE_HIT = 7;
const DOCK_SPRING = { type: "spring" as const, stiffness: 380, damping: 34 };

export const RightDock: React.FC<Props> = ({
  symbols,
  activeSymbol,
  onSelectSymbol,
  onAddSymbol,
  activeCandle,
  indicators,
  alerts,
  onRemoveAlert,
  onToggleAlert,
  onResetAlert,
  notifyEnabled,
  onToggleNotifications,
  onOpenCreateAlert,
  events,
  orderBook,
  trades,
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<TabType | null>("watchlist");
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [width, setWidth] = useState<number>(() => loadDockWidth());
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const pendingWidth = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();

  const drawerOpen = !isCollapsed && activeTab !== null;

  // Persist the width (clamped) whenever it changes so a reload restores it.
  useEffect(() => {
    saveDockWidth(width);
  }, [width]);

  // Layout space (`laidOpen`) and visual slide (`slideIn`) are separate so the
  // flex row is never re-laid out once per animation frame:
  //  - open:  commit the space first, then slide the panel in;
  //  - close: slide the panel out first, then collapse the space when the slide
  //    completes (no gap/flash; the chart is re-laid out exactly once per
  //    committed width change, at the right moment).
  const [laidOpen, setLaidOpen] = useState(drawerOpen);
  const [slideIn, setSlideIn] = useState(drawerOpen);
  const drawerOpenRef = useRef(drawerOpen);
  drawerOpenRef.current = drawerOpen;

  useEffect(() => {
    if (drawerOpen) {
      setLaidOpen(true);
      setSlideIn(true);
    } else {
      setSlideIn(false);
      // Reduced motion: there is no slide to wait for, collapse at once.
      if (reduce) setLaidOpen(false);
    }
  }, [drawerOpen, reduce]);

  const handleSlideComplete = () => {
    // The slide-out finished: now (and only now) release the layout space.
    if (!drawerOpenRef.current) setLaidOpen(false);
  };

  // Track the drag on the window so the pointer can leave the 1px handle.
  // The pointer feeds a style-only echo on the panel + track + layout box (so
  // the drawer tracks at input rate and the committed value is synchronously
  // readable), while the React commit and the chart follow-up are coalesced to
  // one per animation frame — never once per mousemove.
  useEffect(() => {
    if (!dragging) return;
    let frame: number | null = null;

    const writeWidths = (next: number) => {
      const laid = `${next + HANDLE_HIT}px`;
      if (wrapperRef.current) wrapperRef.current.style.width = laid;
      if (sliderRef.current) sliderRef.current.style.width = laid;
      if (panelRef.current) panelRef.current.style.width = `${next}px`;
    };

    const flush = () => {
      frame = null;
      const next = pendingWidth.current;
      if (next == null) return;
      pendingWidth.current = null;
      writeWidths(next);
      setWidth(next);
    };

    const onMove = (e: MouseEvent) => {
      const st = dragState.current;
      if (!st) return;
      const next = widthFromDrag(st.startWidth, e.clientX - st.startX);
      pendingWidth.current = next;
      // Style-only echo at input rate: it keeps the panel, the track and the
      // layout box on the same value for the frame the browser is about to
      // paint (and keeps the committed value synchronously readable). No React
      // work and no chart measurement happens here — both are coalesced below.
      writeWidths(next);
      if (frame == null && typeof requestAnimationFrame === "function") {
        frame = requestAnimationFrame(flush);
      }
    };

    const onUp = () => {
      if (frame != null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frame);
      }
      frame = null;
      const next = pendingWidth.current;
      pendingWidth.current = null;
      if (next != null) {
        // Commit the exact value the per-frame path would have committed.
        writeWidths(next);
        setWidth(next);
      }
      setDragging(false);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (frame != null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frame);
        frame = null;
      }
    };
  }, [dragging]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: width };
    setDragging(true);
  };

  const toggleTab = (tab: TabType) => {
    if (activeTab === tab && !isCollapsed) {
      setIsCollapsed(true);
    } else {
      setActiveTab(tab);
      setIsCollapsed(false);
    }
  };

  const navItems = [
    {
      id: "watchlist" as TabType,
      icon: Bookmark,
      title: t("Watchlist & Details"),
    },
    { id: "alerts" as TabType, icon: Bell, title: t("Alerts") },
    { id: "news" as TabType, icon: Newspaper, title: t("News Headlines") },
    { id: "datawindow" as TabType, icon: Layers, title: t("Data Window") },
    { id: "hotlists" as TabType, icon: Flame, title: t("Hotlists") },
    {
      id: "calendar" as TabType,
      icon: Calendar,
      title: t("Economic Calendar"),
    },
    {
      id: "orderbook" as TabType,
      icon: BarChart3,
      title: t("Order Book (DOM)"),
    },
    {
      id: "ideas" as TabType,
      icon: MessageSquare,
      title: t("Public Stream & Chat"),
    },
  ];

  return (
    <div id="tradingview-right-dock" className="flex h-full flex-none z-20 select-none relative">
      {/* Sliding Drawer Container (width is drag-resizable 260-500px).
          The layout box changes size in ONE discrete commit per open/close (and
          once per animation frame while dragging) — never per animation frame
          of a slide; the visual slide is a composited translateX on the inner
          track, so it costs no layout. The wrapper around handle + panel stays
          display:flex; the inner panel keeps its literal inline width for the
          resize contract. */}
      <div
        ref={wrapperRef}
        className="flex h-full flex-none overflow-hidden"
        style={{ width: laidOpen ? width + HANDLE_HIT : 0 }}
      >
        <motion.div
          ref={sliderRef}
          className="flex h-full flex-none"
          style={{ width: width + HANDLE_HIT }}
          initial={false}
          animate={{ x: slideIn ? "0%" : "100%" }}
          transition={dragging || reduce ? { duration: 0 } : DOCK_SPRING}
          onAnimationComplete={handleSlideComplete}
        >
          <div
            data-testid="right-dock-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label={t("Resize Panel")}
            onMouseDown={handleResizeStart}
            className="group relative h-full flex-none cursor-col-resize"
            style={{ width: `${HANDLE_HIT}px` }}
          >
            <span
              className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
                dragging ? "bg-signal" : "bg-line group-hover:bg-signal"
              }`}
            />
          </div>

          <div
            data-testid="right-dock-panel"
            ref={panelRef}
            style={{ width: `${width}px` }}
            className="h-full flex-none border-l border-line flex flex-col bg-surface"
          >
            {activeTab === "watchlist" && (
              <WatchlistPanel
                symbols={symbols}
                activeSymbol={activeSymbol}
                onSelectSymbol={onSelectSymbol}
                onAddSymbol={onAddSymbol}
                theme={theme}
              />
            )}

            {activeTab === "alerts" && (
              <AlertsPanel
                alerts={alerts}
                onRemoveAlert={onRemoveAlert}
                onToggleAlert={onToggleAlert}
                onResetAlert={onResetAlert}
                notifyEnabled={notifyEnabled}
                onToggleNotifications={onToggleNotifications}
                onOpenCreateAlert={onOpenCreateAlert}
                activeSymbol={activeSymbol}
                theme={theme}
              />
            )}

            {activeTab === "news" && <NewsPanel theme={theme} />}

            {activeTab === "datawindow" && (
              <DataWindowPanel
                symbol={activeSymbol}
                activeCandle={activeCandle}
                indicators={indicators}
                theme={theme}
              />
            )}

            {activeTab === "hotlists" && (
              <HotlistsPanel symbols={symbols} onSelectSymbol={onSelectSymbol} theme={theme} />
            )}

            {activeTab === "calendar" && <CalendarPanel events={events} theme={theme} />}

            {activeTab === "orderbook" && (
              <div className="flex flex-col h-full min-h-0">
                <div className="min-h-0 flex-1">
                  <OrderBookPanel symbol={activeSymbol} orderBook={orderBook} theme={theme} />
                </div>
                <div className="min-h-0 flex-1 border-t border-line">
                  <TradesTape trades={trades} precision={2} theme={theme} />
                </div>
              </div>
            )}

            {activeTab === "ideas" && <CommunityIdeasPanel theme={theme} />}
          </div>
        </motion.div>
      </div>

      {/* Live width readout, anchored left of the grabber while dragging */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: 8 }}
            transition={reduce ? { duration: 0 } : DOCK_SPRING}
            className="ta-glass pointer-events-none absolute right-full top-10 z-30 mr-1 rounded-md border border-line px-2 py-1 ta-num text-2xs font-semibold text-signal shadow-e2"
          >
            {Math.round(width)}px
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right Iconic Vertical Toolstrip */}
      <div
        id="right-toolstrip"
        className="w-[44px] flex-none flex flex-col items-center py-2 border-l border-line bg-surface text-muted"
      >
        <div className="flex flex-col items-center gap-1.5 w-full flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id && !isCollapsed;

            return (
              <motion.button
                key={item.id}
                id={`right-tab-${item.id}`}
                onClick={() => toggleTab(item.id)}
                whileHover={reduce ? undefined : { scale: 1.06 }}
                whileTap={reduce ? undefined : { scale: 0.94 }}
                transition={DOCK_SPRING}
                className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
                title={item.title}
              >
                {isActive && (
                  <motion.span
                    layoutId="right-toolstrip-active-pill"
                    transition={reduce ? { duration: 0 } : DOCK_SPRING}
                    className="absolute inset-0 rounded-xl bg-signal shadow-e1"
                  />
                )}
                <span
                  className={`relative z-10 ${
                    isActive ? "text-signal-ink" : "text-muted hover:text-content"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                {item.id === "alerts" && alerts.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-signal" />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Expand / Collapse Arrow Toggle */}
        <button
          id="right-dock-collapse-toggle"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted transition-colors hover:bg-surface-2 hover:text-content"
          title={isCollapsed ? "Open Side Panel" : "Collapse Side Panel"}
        >
          {isCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
