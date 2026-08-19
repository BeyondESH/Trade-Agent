import React, { useState } from 'react';
import {
  DesktopTab,
  DesktopViewMode,
  ThemeMode,
} from '../../types/trading';
import {
  Plus,
  X,
  Pin,
  Search,
  Cloud,
  CloudCheck,
  Settings,
  Bell,
  Menu,
  Maximize2,
  Minimize2,
  Minus,
  Check,
  HelpCircle,
  Keyboard,
  ExternalLink,
  ChevronDown,
  Monitor,
  Layout,
  TrendingUp,
  Flame,
  Filter,
  Users,
  Newspaper,
  Share2,
} from 'lucide-react';
import { t } from '../../lib/i18n';

interface Props {
  tabs: DesktopTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: (type: DesktopViewMode | 'dashboard') => void;
  onPinTab: (id: string) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenCommandPalette: () => void;
  onOpenDesktopSettings: () => void;
  onOpenShortcutsModal: () => void;
}

export const DesktopTitleBar: React.FC<Props> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onPinTab,
  theme,
  onToggleTheme,
  onOpenCommandPalette,
  onOpenDesktopSettings,
  onOpenShortcutsModal,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const isDark = theme === 'dark';

  const getTabIcon = (type: DesktopViewMode | 'dashboard') => {
    switch (type) {
      case 'chart':
        return <TrendingUp className="w-3.5 h-3.5 text-[#2962ff]" />;
      case 'markets':
        return <Monitor className="w-3.5 h-3.5 text-[#00bcd4]" />;
      case 'screener':
        return <Filter className="w-3.5 h-3.5 text-[#ff9800]" />;
      case 'heatmaps':
        return <Flame className="w-3.5 h-3.5 text-[#f23645]" />;
      case 'community':
        return <Users className="w-3.5 h-3.5 text-[#9c27b0]" />;
      case 'news':
        return <Newspaper className="w-3.5 h-3.5 text-[#4caf50]" />;
      case 'dashboard':
        return <Layout className="w-3.5 h-3.5 text-[#2962ff]" />;
      default:
        return <Layout className="w-3.5 h-3.5 text-[#2962ff]" />;
    }
  };

  return (
    <div
      id="beyondether-desktop-titlebar"
      className={`h-9 w-full flex items-center justify-between border-b px-2 select-none z-50 text-xs font-sans ${
        isDark ? 'bg-[#0f1118] border-[#2a2e39] text-[#d1d4dc]' : 'bg-[#e0e3eb] border-[#cbcfd9] text-[#131722]'
      }`}
    >
      {/* Left: Window Controls + BeyondEther Main Menu */}
      <div className="flex items-center gap-2 h-full">
        {/* BE Hamburger App Menu */}
        <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors font-bold ${
              isDark ? 'hover:bg-[#1e222d] text-white' : 'hover:bg-white text-black'
            }`}
          >
            <div className="w-4 h-4 bg-[#2962ff] text-white rounded flex items-center justify-center font-black text-[10px]">
              BE
            </div>
            <span className="font-semibold text-xs tracking-tight">{t('BeyondEther')}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {isMenuOpen && (
            <div
              className={`absolute top-full left-0 mt-1 w-56 rounded-lg shadow-2xl border py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 ${
                isDark ? 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
              }`}
            >
              <div className="px-3 py-1.5 border-b border-gray-500/20 text-[11px] font-semibold text-gray-400">
                BeyondEther Desktop Pro
              </div>

              <button
                onClick={() => {
                  onNewTab('chart');
                  setIsMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between ${
                  isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'
                }`}
              >
                <span>{t('New Chart Tab')}</span>
                <span className="text-[10px] text-gray-400 font-mono">⌘T</span>
              </button>

              <button
                onClick={() => {
                  onOpenCommandPalette();
                  setIsMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between ${
                  isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'
                }`}
              >
                <span>{t('Command Palette')}</span>
                <span className="text-[10px] text-gray-400 font-mono">⌘K</span>
              </button>

              <div className="my-1 border-t border-gray-500/20" />

              <button
                onClick={() => {
                  onToggleTheme();
                  setIsMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between ${
                  isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'
                }`}
              >
                <span>{t(theme === 'dark' ? 'Color Theme: Dark' : 'Color Theme: Light')}</span>
                <span className="text-[10px] text-[#2962ff] font-semibold">{t('Toggle')}</span>
              </button>

              <button
                onClick={() => {
                  onOpenDesktopSettings();
                  setIsMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
                  isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{t('Desktop App Settings')}</span>
              </button>

              <button
                onClick={() => {
                  onOpenShortcutsModal();
                  setIsMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
                  isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'
                }`}
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>{t('Keyboard Shortcuts')}</span>
              </button>

              <div className="my-1 border-t border-gray-500/20" />

              <div className="px-3 py-1 text-[10px] text-gray-400 flex items-center justify-between">
                <span>{t('Cloud Sync: Active')}</span>
                <span className="w-2 h-2 rounded-full bg-[#089981]"></span>
              </div>
            </div>
          )}
        </div>

        {/* Multi-Tab Bar Container */}
        <div className="flex items-center h-full gap-1 overflow-x-auto no-scrollbar max-w-[620px]">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`group flex items-center gap-1.5 px-3 h-[28px] rounded-t-md cursor-pointer border-t border-x transition-all duration-100 select-none ${
                  isActive
                    ? isDark
                      ? 'bg-[#131722] border-[#2a2e39] text-white font-medium shadow-xs'
                      : 'bg-white border-[#cbcfd9] text-black font-semibold shadow-xs'
                    : isDark
                    ? 'border-transparent text-gray-400 hover:bg-[#1e222d] hover:text-gray-200'
                    : 'border-transparent text-gray-600 hover:bg-[#d8dce6] hover:text-black'
                }`}
              >
                {getTabIcon(tab.type)}
                <span className="truncate max-w-[120px] text-[11px]">{tab.title}</span>

                {tab.isPinned && <Pin className="w-2.5 h-2.5 text-[#2962ff] rotate-45" />}

                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className="p-0.5 rounded-full hover:bg-gray-500/30 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3 text-gray-400 hover:text-white" />
                  </button>
                )}
              </div>
            );
          })}

          {/* "+" New Tab Button -> Dashboard */}
          <button
            onClick={() => onNewTab('dashboard')}
            className={`p-1.5 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white transition-colors`}
            title={t('Add New Workspace Tab')}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center/Right: Global Search Bar + Utilities + Profile */}
      <div className="flex items-center gap-2">
        {/* Global Quick Search Bar */}
        <button
          onClick={onOpenCommandPalette}
          className={`flex items-center gap-2 px-3 py-1 rounded-md border text-xs transition-colors ${
            isDark
              ? 'bg-[#131722] border-[#2a2e39] text-gray-400 hover:text-white hover:border-[#2962ff]'
              : 'bg-white border-[#cbcfd9] text-gray-600 hover:text-black hover:border-[#2962ff]'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>快速搜索...</span>
          <kbd className="px-1.5 py-0.5 rounded bg-gray-500/20 text-[10px] font-mono">⌘K</kbd>
        </button>

        {/* Cloud Auto-Save Status */}
        <div
          className="flex items-center gap-1 text-[11px] text-gray-400 px-1 cursor-pointer"
          title="All changes autosaved to BeyondEther Cloud"
        >
          <Cloud className="w-3.5 h-3.5 text-[#089981]" />
          <span className="hidden md:inline">{t('Autosaved')}</span>
        </div>

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="p-1.5 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white transition-colors relative"
            title="Notifications"
          >
            <Bell className="w-3.5 h-3.5" />
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#2962ff]" />
          </button>

          {isNotificationsOpen && (
            <div
              className={`absolute top-full right-0 mt-1 w-72 rounded-lg shadow-2xl border p-3 z-50 text-xs animate-in fade-in zoom-in-95 duration-100 ${
                isDark ? 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
              }`}
            >
              <div className="font-bold text-xs mb-2 flex items-center justify-between">
                <span>Notifications</span>
                <span className="text-[10px] text-[#2962ff] cursor-pointer">Mark all read</span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="p-2 rounded bg-[#2962ff]/10 border border-[#2962ff]/30 text-[11px]">
                  <div className="font-bold text-[#2962ff]">{t('Price Alert Triggered')}</div>
                  <div className="text-gray-300">BTCUSDT 上穿 $96,000</div>
                  <div className="text-[9px] text-gray-500 mt-1">4 分钟前</div>
                </div>
                <div className="p-2 rounded bg-gray-500/10 text-[11px]">
                  <div className="font-bold">{t('New Pine Script Update')}</div>
                  <div className="text-gray-400">SuperTrend Dynamic Breakout v4 已更新</div>
                  <div className="text-[9px] text-gray-500 mt-1">1 小时前</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Shortcuts Icon */}
        <button
          onClick={onOpenShortcutsModal}
          className="p-1.5 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white transition-colors"
            title={t('Keyboard Shortcuts (?)')}
        >
          <Keyboard className="w-3.5 h-3.5" />
        </button>

        {/* Settings Icon */}
        <button
          onClick={onOpenDesktopSettings}
          className="p-1.5 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white transition-colors"
          title={t('Desktop App Settings')}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Profile Avatar */}
        <div
          className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded cursor-pointer hover:bg-gray-500/20"
          title="Trader Profile (Pro Plan Active)"
        >
          <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#2962ff] to-[#00bcd4] flex items-center justify-center text-white font-bold text-[10px]">
            BE
          </div>
          <span className="font-semibold text-[11px] hidden sm:inline">Pro+</span>
        </div>
      </div>
    </div>
  );
};
