import React, { useState } from 'react';
import {
  SymbolInfo,
  Candle,
  IndicatorConfig,
  AlertItem,
  NewsItem,
  EconomicEvent,
  OrderBookEntry,
} from '../../types/trading';
import {
  Bookmark,
  Bell,
  Newspaper,
  Layers,
  Flame,
  Calendar,
  BarChart3,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { WatchlistPanel } from './WatchlistPanel';
import { AlertsPanel } from './AlertsPanel';
import { NewsPanel } from './NewsPanel';
import { DataWindowPanel } from './DataWindowPanel';
import { HotlistsPanel } from './HotlistsPanel';
import { CalendarPanel } from './CalendarPanel';
import { OrderBookPanel } from './OrderBookPanel';
import { TradesTape } from './TradesTape';
import { CommunityIdeasPanel } from './CommunityIdeasPanel';
import type { Trade } from '../../hooks/useTrades';
import { t } from '../../lib/i18n';

interface Props {
  symbols: SymbolInfo[];
  activeSymbol: SymbolInfo;
  onSelectSymbol: (symbol: SymbolInfo) => void;
  onAddSymbol: () => void;
  activeCandle: Candle | null;
  indicators: IndicatorConfig[];
  alerts: AlertItem[];
  onRemoveAlert: (id: string) => void;
  onOpenCreateAlert: () => void;
  events: EconomicEvent[];
  orderBook: { bids: OrderBookEntry[]; asks: OrderBookEntry[] };
  trades: Trade[];
  theme: 'dark' | 'light';
}
type TabType =
  | 'watchlist'
  | 'alerts'
  | 'news'
  | 'datawindow'
  | 'hotlists'
  | 'calendar'
  | 'orderbook'
  | 'ideas';

export const RightDock: React.FC<Props> = ({
  symbols,
  activeSymbol,
  onSelectSymbol,
  onAddSymbol,
  activeCandle,
  indicators,
  alerts,
  onRemoveAlert,
  onOpenCreateAlert,
  events,
  orderBook,
  trades,
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<TabType | null>('watchlist');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const isDark = theme === 'dark';

  const toggleTab = (tab: TabType) => {
    if (activeTab === tab && !isCollapsed) {
      setIsCollapsed(true);
    } else {
      setActiveTab(tab);
      setIsCollapsed(false);
    }
  };

  const navItems = [
    { id: 'watchlist' as TabType, icon: Bookmark, title: t('Watchlist & Details') },
    { id: 'alerts' as TabType, icon: Bell, title: t('Alerts') },
    { id: 'news' as TabType, icon: Newspaper, title: t('News Headlines') },
    { id: 'datawindow' as TabType, icon: Layers, title: t('Data Window') },
    { id: 'hotlists' as TabType, icon: Flame, title: t('Hotlists') },
    { id: 'calendar' as TabType, icon: Calendar, title: t('Economic Calendar') },
    { id: 'orderbook' as TabType, icon: BarChart3, title: t('Order Book (DOM)') },
    { id: 'ideas' as TabType, icon: MessageSquare, title: t('Public Stream & Chat') },
  ];

  return (
    <div
      id="tradingview-right-dock"
      className="flex h-full flex-none z-20 select-none relative"
    >
      {/* Sliding Drawer Container */}
      {!isCollapsed && activeTab && (
        <div
          className={`w-[280px] sm:w-[310px] h-full border-l flex flex-col transition-all ${
            isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
          }`}
        >
          {activeTab === 'watchlist' && (
            <WatchlistPanel
              symbols={symbols}
              activeSymbol={activeSymbol}
              onSelectSymbol={onSelectSymbol}
              onAddSymbol={onAddSymbol}
              theme={theme}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertsPanel
              alerts={alerts}
              onRemoveAlert={onRemoveAlert}
              onOpenCreateAlert={onOpenCreateAlert}
              activeSymbol={activeSymbol}
              theme={theme}
            />
          )}

          {activeTab === 'news' && <NewsPanel theme={theme} />}

          {activeTab === 'datawindow' && (
            <DataWindowPanel
              symbol={activeSymbol}
              activeCandle={activeCandle}
              indicators={indicators}
              theme={theme}
            />
          )}

          {activeTab === 'hotlists' && (
            <HotlistsPanel
              symbols={symbols}
              onSelectSymbol={onSelectSymbol}
              theme={theme}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarPanel events={events} theme={theme} />
          )}

          {activeTab === 'orderbook' && (
            <div className="flex flex-col h-full min-h-0">
              <div className="min-h-0 flex-1">
                <OrderBookPanel
                  symbol={activeSymbol}
                  orderBook={orderBook}
                  theme={theme}
                />
              </div>
              <div className="min-h-0 flex-1 border-t">
                <TradesTape trades={trades} precision={2} theme={theme} />
              </div>
            </div>
          )}

          {activeTab === 'ideas' && <CommunityIdeasPanel theme={theme} />}
        </div>
      )}

      {/* Right Iconic Vertical Toolstrip */}
      <div
        id="right-toolstrip"
        className={`w-[44px] flex-none flex flex-col items-center py-2 border-l ${
          isDark ? 'bg-[#131722] border-[#2a2e39] text-[#787b86]' : 'bg-white border-[#e0e3eb] text-[#787b86]'
        }`}
      >
        <div className="flex flex-col items-center gap-1.5 w-full flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id && !isCollapsed;

            return (
              <button
                key={item.id}
                id={`right-tab-${item.id}`}
                onClick={() => toggleTab(item.id)}
                className={`w-8 h-8 rounded flex items-center justify-center transition-colors relative ${
                  isActive
                    ? 'bg-[#2962ff] text-white shadow-xs'
                    : isDark
                    ? 'hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
                    : 'hover:bg-[#f0f3fa] hover:text-[#131722]'
                }`}
                title={item.title}
              >
                <Icon className="w-4 h-4" />
                {item.id === 'alerts' && alerts.length > 0 && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#ff9800]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Expand / Collapse Arrow Toggle */}
        <button
          id="right-dock-collapse-toggle"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
            isDark ? 'hover:bg-[#2a2e39] text-[#787b86]' : 'hover:bg-[#f0f3fa] text-[#787b86]'
          }`}
          title={isCollapsed ? 'Open Side Panel' : 'Collapse Side Panel'}
        >
          {isCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
