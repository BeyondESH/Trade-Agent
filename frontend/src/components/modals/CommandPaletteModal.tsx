import React, { useState } from 'react';
import { SymbolInfo, DesktopViewMode, ThemeMode } from '../../types/trading';
import {
  Search,
  X,
  TrendingUp,
  Monitor,
  Filter,
  Flame,
  Users,
  Newspaper,
  Settings,
  Keyboard,
  Sun,
  Moon,
  ChevronRight,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  symbols: SymbolInfo[];
  onSelectSymbol: (symbol: SymbolInfo) => void;
  onSelectView: (view: DesktopViewMode) => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  theme: ThemeMode;
}

export const CommandPaletteModal: React.FC<Props> = ({
  isOpen,
  onClose,
  symbols,
  onSelectSymbol,
  onSelectView,
  onToggleTheme,
  onOpenSettings,
  onOpenShortcuts,
  theme,
}) => {
  const [query, setQuery] = useState('');
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const filteredSymbols = symbols.filter(
    (s) =>
      s.ticker.toLowerCase().includes(query.toLowerCase()) ||
      s.name.toLowerCase().includes(query.toLowerCase())
  );

  const actions = [
    { id: 'view-chart', label: 'Open SuperCharts', type: 'view' as const, view: 'chart' as DesktopViewMode, icon: <TrendingUp className="w-4 h-4 text-[#2962ff]" /> },
    { id: 'view-markets', label: 'Open Markets Overview', type: 'view' as const, view: 'markets' as DesktopViewMode, icon: <Monitor className="w-4 h-4 text-[#00bcd4]" /> },
    { id: 'view-screener', label: 'Open Screener 2.0', type: 'view' as const, view: 'screener' as DesktopViewMode, icon: <Filter className="w-4 h-4 text-[#ff9800]" /> },
    { id: 'view-heatmaps', label: 'Open Market Heatmaps', type: 'view' as const, view: 'heatmaps' as DesktopViewMode, icon: <Flame className="w-4 h-4 text-[#f23645]" /> },
    { id: 'view-community', label: 'Open Community Ideas', type: 'view' as const, view: 'community' as DesktopViewMode, icon: <Users className="w-4 h-4 text-[#9c27b0]" /> },
    { id: 'view-news', label: 'Open News & Calendar', type: 'view' as const, view: 'news' as DesktopViewMode, icon: <Newspaper className="w-4 h-4 text-[#4caf50]" /> },
    { id: 'act-theme', label: `Toggle Theme (${theme === 'dark' ? 'Light Mode' : 'Dark Mode'})`, type: 'theme' as const, icon: theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-indigo-400" /> },
    { id: 'act-shortcuts', label: 'View Keyboard Shortcuts', type: 'shortcuts' as const, icon: <Keyboard className="w-4 h-4 text-gray-400" /> },
    { id: 'act-settings', label: 'Open Desktop App Settings', type: 'settings' as const, icon: <Settings className="w-4 h-4 text-gray-400" /> },
  ].filter((a) => a.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-xs p-4 select-none">
      <div
        id="command-palette-modal"
        className={`w-full max-w-xl rounded-xl shadow-2xl border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${
          isDark ? 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
        }`}
      >
        {/* Search Input Bar */}
        <div className={`p-3 border-b flex items-center gap-3 ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, symbol (BTC, NVDA, AAPL), or open a workspace..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-500"
          />
          <kbd className="px-2 py-0.5 rounded bg-gray-500/20 text-[10px] font-mono text-gray-400">ESC</kbd>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-500/20 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto p-2 flex flex-col gap-1 text-xs">
          {/* Quick Actions */}
          {actions.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Workspace & Navigation
              </div>
              {actions.map((act) => (
                <div
                  key={act.id}
                  onClick={() => {
                    if (act.type === 'view') onSelectView(act.view);
                    else if (act.type === 'theme') onToggleTheme();
                    else if (act.type === 'shortcuts') onOpenShortcuts();
                    else if (act.type === 'settings') onOpenSettings();
                    onClose();
                  }}
                  className={`px-3 py-2 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                    isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {act.icon}
                    <span className="font-semibold text-white">{act.label}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                </div>
              ))}
            </div>
          )}

          {/* Symbols */}
          {filteredSymbols.length > 0 && (
            <div className="mt-2">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Trading Instruments
              </div>
              {filteredSymbols.map((sym) => (
                <div
                  key={sym.id}
                  onClick={() => {
                    onSelectSymbol(sym);
                    onSelectView('chart');
                    onClose();
                  }}
                  className={`px-3 py-2 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                    isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white font-mono">{sym.ticker}</span>
                    <span className="text-gray-400">{sym.name}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-bold">${sym.price.toLocaleString()}</span>
                    <span className={sym.change24hPercent >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                      {sym.change24hPercent >= 0 ? '+' : ''}{sym.change24hPercent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
