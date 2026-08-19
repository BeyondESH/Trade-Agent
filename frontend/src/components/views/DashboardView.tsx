import React from 'react';
import { DesktopViewMode, ThemeMode } from '../../types/trading';
import { t } from '../../lib/i18n';
import {
  LayoutDashboard,
  TrendingUp,
  Monitor,
  Filter,
  Flame,
  Users,
  Newspaper,
  ArrowRight,
} from 'lucide-react';

interface Props {
  theme: ThemeMode;
  onOpen: (type: DesktopViewMode) => void;
}

interface CardDef {
  type: DesktopViewMode;
  title: string;
  desc: string;
  icon: React.ReactNode;
  accent: string;
}

const CARDS: CardDef[] = [
  {
    type: 'chart',
    title: 'SuperCharts',
    desc: 'Interactive candlestick chart with technical indicators, order book and trading tools.',
    icon: <TrendingUp className="w-5 h-5" />,
    accent: '#2962ff',
  },
  {
    type: 'markets',
    title: 'Markets Overview',
    desc: 'Real-time crypto, macro and on-chain market indicators at a glance.',
    icon: <Monitor className="w-5 h-5" />,
    accent: '#00bcd4',
  },
  {
    type: 'screener',
    title: 'Screener 2.0',
    desc: 'Filter and sort symbols across crypto, stocks and forex by live quotes.',
    icon: <Filter className="w-5 h-5" />,
    accent: '#ff9800',
  },
  {
    type: 'heatmaps',
    title: 'Market Heatmaps',
    desc: 'Treemap visualization of relative market cap and sector performance.',
    icon: <Flame className="w-5 h-5" />,
    accent: '#f23645',
  },
  {
    type: 'community',
    title: 'Community Ideas',
    desc: 'Public stream, ideas and chat from the trading community.',
    icon: <Users className="w-5 h-5" />,
    accent: '#9c27b0',
  },
  {
    type: 'news',
    title: 'News & Calendar',
    desc: 'Real-time crypto news and economic calendar events.',
    icon: <Newspaper className="w-5 h-5" />,
    accent: '#4caf50',
  },
];

export const DashboardView: React.FC<Props> = ({ theme, onOpen }) => {
  const isDark = theme === 'dark';

  return (
    <div
      id="dashboard-view"
      className={`flex-1 h-full overflow-y-auto overflow-x-hidden p-6 select-none font-sans ${
        isDark ? 'bg-[#131722] text-[#d1d4dc]' : 'bg-[#f0f3fa] text-[#131722]'
      }`}
    >
      {/* Header */}
      <div className="mb-6 flex items-center gap-2">
        <LayoutDashboard className="w-5 h-5 text-[#2962ff]" />
        <h1 className="text-xl font-bold">{t('Workspace Dashboard')}</h1>
        <span className="text-xs text-gray-400 ml-2">{t('Select an interface to open')}</span>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((card) => (
          <button
            key={card.type}
            onClick={() => onOpen(card.type)}
            className={`group text-left p-5 rounded-xl border flex flex-col gap-3 transition-all duration-150 cursor-pointer hover:scale-[1.02] hover:shadow-lg ${
              isDark
                ? 'bg-[#1e222d] border-[#2a2e39] hover:border-[#2962ff]'
                : 'bg-white border-[#e0e3eb] hover:border-[#2962ff]'
            }`}
          >
            <div className="flex items-start justify-between">
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${card.accent}22`, color: card.accent }}
              >
                {card.icon}
              </div>
              <ArrowRight className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <div>
              <div className="font-bold text-sm flex items-center gap-2" style={{ color: card.accent }}>
                {t(card.title)}
              </div>
              <p className={`text-xs mt-1.5 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {t(card.desc)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
