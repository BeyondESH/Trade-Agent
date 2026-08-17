import React from 'react';
import { DesktopViewMode, ThemeMode } from '../../types/trading';
import {
  TrendingUp,
  Monitor,
  Filter,
  Flame,
  Users,
  Newspaper,
  Code,
  Briefcase,
  Sun,
  Moon,
  Search,
  Keyboard,
  HelpCircle,
  Settings,
} from 'lucide-react';

interface Props {
  activeView: DesktopViewMode;
  onSelectView: (view: DesktopViewMode) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenCommandPalette: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
}

export const GlobalNavRail: React.FC<Props> = ({
  activeView,
  onSelectView,
  theme,
  onToggleTheme,
  onOpenCommandPalette,
  onOpenShortcuts,
  onOpenSettings,
}) => {
  const isDark = theme === 'dark';

  const navItems: { id: DesktopViewMode; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'chart',
      label: 'SuperCharts',
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      id: 'markets',
      label: 'Markets',
      icon: <Monitor className="w-4 h-4" />,
    },
    {
      id: 'screener',
      label: 'Screener',
      icon: <Filter className="w-4 h-4" />,
      badge: '2.0',
    },
    {
      id: 'heatmaps',
      label: 'Heatmaps',
      icon: <Flame className="w-4 h-4" />,
    },
    {
      id: 'community',
      label: 'Community',
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'news',
      label: 'News',
      icon: <Newspaper className="w-4 h-4" />,
    },
    {
      id: 'pine',
      label: 'Pine Studio',
      icon: <Code className="w-4 h-4" />,
    },
    {
      id: 'brokers',
      label: 'Brokers',
      icon: <Briefcase className="w-4 h-4" />,
    },
  ];

  return (
    <aside
      id="global-nav-rail"
      className={`w-12 h-full flex flex-col items-center justify-between border-r py-2 select-none z-40 shrink-0 ${
        isDark ? 'bg-[#0f1118] border-[#2a2e39] text-[#787b86]' : 'bg-[#e8ebf2] border-[#cbcfd9] text-[#606470]'
      }`}
    >
      {/* Top Primary View Modes */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`group relative w-9 h-9 rounded-lg flex flex-col items-center justify-center transition-all duration-150 ${
                isActive
                  ? 'bg-[#2962ff] text-white shadow-md'
                  : isDark
                  ? 'hover:bg-[#1e222d] hover:text-white'
                  : 'hover:bg-white hover:text-black'
              }`}
              title={item.label}
            >
              {item.icon}

              {item.badge && !isActive && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#ff9800]" />
              )}

              {/* Hover Tooltip Pill */}
              <div className="opacity-0 group-hover:opacity-100 absolute left-full ml-2 z-50 px-2 py-1 rounded bg-[#1e222d] text-white text-[11px] font-semibold pointer-events-none whitespace-nowrap shadow-xl border border-[#2a2e39] transition-opacity">
                {item.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Global Action Controls */}
      <div className="flex flex-col items-center gap-1.5 w-full pt-2 border-t border-gray-500/20">
        <button
          onClick={onOpenCommandPalette}
          className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
            isDark ? 'hover:bg-[#1e222d] hover:text-white' : 'hover:bg-white hover:text-black'
          }`}
          title="Command Palette (⌘K)"
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onToggleTheme}
          className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
            isDark ? 'hover:bg-[#1e222d] hover:text-yellow-400' : 'hover:bg-white hover:text-indigo-600'
          }`}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={onOpenShortcuts}
          className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
            isDark ? 'hover:bg-[#1e222d] hover:text-white' : 'hover:bg-white hover:text-black'
          }`}
          title="Keyboard Shortcuts (?)"
        >
          <Keyboard className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onOpenSettings}
          className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
            isDark ? 'hover:bg-[#1e222d] hover:text-white' : 'hover:bg-white hover:text-black'
          }`}
          title="Desktop Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
