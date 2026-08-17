import React, { useState } from 'react';
import {
  SymbolInfo,
  Timeframe,
  ChartType,
  ThemeMode,
} from '../../types/trading';
import {
  Search,
  CandlestickChart,
  LineChart,
  SlidersHorizontal,
  Bell,
  RotateCcw,
  Undo2,
  Redo2,
  LayoutGrid,
  Settings,
  Maximize,
  Camera,
  Sun,
  Moon,
  ChevronDown,
  Sparkles,
  CloudCheck,
  BarChart2,
  TrendingUp,
} from 'lucide-react';

interface Props {
  symbol: SymbolInfo;
  timeframe: Timeframe;
  onChangeTimeframe: (tf: Timeframe) => void;
  chartType: ChartType;
  onChangeChartType: (type: ChartType) => void;
  onOpenSymbolSearch: () => void;
  onOpenIndicatorsModal: () => void;
  onOpenAlertModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenSnapshotModal: () => void;
  onToggleReplay: () => void;
  isReplayActive: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenOrderModal: (side: 'BUY' | 'SELL') => void;
  activeLayout: string;
  onChangeLayout: (layout: string) => void;
}

const TIMEFRAMES: Timeframe[] = ['1s', '1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M'];

const CHART_TYPES: Array<{ type: ChartType; label: string; icon: any }> = [
  { type: 'candles', label: 'Candles', icon: CandlestickChart },
  { type: 'heikin_ashi', label: 'Heikin Ashi', icon: CandlestickChart },
  { type: 'line', label: 'Line', icon: LineChart },
  { type: 'area', label: 'Area', icon: TrendingUp },
  { type: 'hollow_candles', label: 'Hollow Candles', icon: CandlestickChart },
  { type: 'bars', label: 'Bars', icon: BarChart2 },
];

export const TopNavbar: React.FC<Props> = ({
  symbol,
  timeframe,
  onChangeTimeframe,
  chartType,
  onChangeChartType,
  onOpenSymbolSearch,
  onOpenIndicatorsModal,
  onOpenAlertModal,
  onOpenSettingsModal,
  onOpenSnapshotModal,
  onToggleReplay,
  isReplayActive,
  theme,
  onToggleTheme,
  onOpenOrderModal,
  activeLayout,
  onChangeLayout,
}) => {
  const [showChartTypeDropdown, setShowChartTypeDropdown] = useState(false);
  const [showLayoutDropdown, setShowLayoutDropdown] = useState(false);
  const isDark = theme === 'dark';

  const CurrentChartIcon =
    CHART_TYPES.find((ct) => ct.type === chartType)?.icon || CandlestickChart;

  return (
    <header
      id="tradingview-top-header"
      className={`h-[44px] flex-none px-2 flex items-center justify-between border-b text-xs select-none transition-colors z-30 ${
        isDark ? 'bg-[#131722] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
      }`}
    >
      {/* Left Section: Logo, Symbol, Timeframes, Chart Types, Indicators, Alerts */}
      <div className="flex items-center gap-1.5 h-full overflow-x-auto no-scrollbar">
        {/* TradingView Icon / Logo Mark */}
        <div className="flex items-center gap-2 pr-2 border-r border-gray-500/20">
          <div className="w-7 h-7 rounded bg-[#2962ff] flex items-center justify-center text-white font-black text-sm tracking-tighter shadow-xs">
            TV
          </div>
        </div>

        {/* Symbol Search Trigger */}
        <button
          id="top-symbol-search-btn"
          onClick={onOpenSymbolSearch}
          className={`flex items-center gap-2 px-2.5 py-1 rounded font-bold transition-colors ${
            isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-[#f0f3fa]'
          }`}
          title="Search Symbol (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-sm tracking-tight text-[#2962ff]">{symbol.ticker}</span>
          <span className="text-[10px] text-gray-500 font-semibold uppercase">{symbol.exchange}</span>
          <span
            className={`text-xs font-mono font-semibold ${
              symbol.change24hPercent >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
            }`}
          >
            {symbol.change24hPercent >= 0 ? '+' : ''}
            {symbol.change24hPercent.toFixed(2)}%
          </span>
        </button>

        <div className="h-4 w-[1px] bg-gray-500/20" />

        {/* Timeframes Bar */}
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              id={`tf-btn-${tf}`}
              onClick={() => onChangeTimeframe(tf)}
              className={`px-2 py-1 rounded font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-[#2962ff] text-white font-semibold shadow-xs'
                  : isDark
                  ? 'hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc]'
                  : 'hover:bg-[#f0f3fa] text-[#787b86] hover:text-[#131722]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="h-4 w-[1px] bg-gray-500/20" />

        {/* Chart Type Dropdown */}
        <div className="relative">
          <button
            id="chart-type-selector-btn"
            onClick={() => setShowChartTypeDropdown(!showChartTypeDropdown)}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
              isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-[#f0f3fa]'
            }`}
            title="Chart Type"
          >
            <CurrentChartIcon className="w-4 h-4 text-[#2962ff]" />
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {showChartTypeDropdown && (
            <div
              className={`absolute top-full left-0 mt-1 py-1 w-44 rounded-lg shadow-xl border z-50 backdrop-blur-md ${
                isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
              }`}
            >
              {CHART_TYPES.map((ct) => {
                const Icon = ct.icon;
                return (
                  <button
                    key={ct.type}
                    onClick={() => {
                      onChangeChartType(ct.type);
                      setShowChartTypeDropdown(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors ${
                      chartType === ct.type
                        ? 'bg-[#2962ff] text-white font-medium'
                        : isDark
                        ? 'hover:bg-[#2a2e39] text-[#d1d4dc]'
                        : 'hover:bg-[#f0f3fa] text-[#131722]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{ct.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="h-4 w-[1px] bg-gray-500/20" />

        {/* Indicators Button */}
        <button
          id="top-indicators-btn"
          onClick={onOpenIndicatorsModal}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-colors ${
            isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-[#f0f3fa]'
          }`}
          title="Indicators & Metrics"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#2962ff]" />
          <span>Indicators</span>
        </button>

        {/* Create Alert Button */}
        <button
          id="top-alert-btn"
          onClick={onOpenAlertModal}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-colors ${
            isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-[#f0f3fa]'
          }`}
          title="Create Alert (Alt+A)"
        >
          <Bell className="w-3.5 h-3.5 text-[#ff9800]" />
          <span>Alert</span>
        </button>

        {/* Bar Replay Button */}
        <button
          id="top-replay-btn"
          onClick={onToggleReplay}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-colors ${
            isReplayActive
              ? 'bg-[#2962ff] text-white shadow-xs'
              : isDark
              ? 'hover:bg-[#2a2e39]'
              : 'hover:bg-[#f0f3fa]'
          }`}
          title="Bar Replay Simulator"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Replay</span>
        </button>

        <div className="h-4 w-[1px] bg-gray-500/20" />

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5">
          <button
            id="undo-btn"
            className="p-1 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            id="redo-btn"
            className="p-1 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right Section: Layout, Autosave, Settings, Snapshot, Quick Buy/Sell, Theme, Profile */}
      <div className="flex items-center gap-1.5 flex-none pl-2">
        {/* Multi-Chart Layout Switcher */}
        <div className="relative">
          <button
            id="layout-grid-btn"
            onClick={() => setShowLayoutDropdown(!showLayoutDropdown)}
            className={`p-1.5 rounded transition-colors ${isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-[#f0f3fa]'}`}
            title="Select Chart Layout"
          >
            <LayoutGrid className="w-4 h-4 text-gray-400" />
          </button>

          {showLayoutDropdown && (
            <div
              className={`absolute top-full right-0 mt-1 p-2 w-48 rounded-lg shadow-xl border z-50 backdrop-blur-md ${
                isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
              }`}
            >
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Multi-Chart Layouts
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: '1x1', label: '1 Chart' },
                  { id: '2x1', label: '2 Vert' },
                  { id: '1x2', label: '2 Horiz' },
                  { id: '2x2', label: '4 Grid' },
                  { id: '3x1', label: '3 Vert' },
                  { id: '1x3', label: '3 Horiz' },
                ].map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      onChangeLayout(l.id);
                      setShowLayoutDropdown(false);
                    }}
                    className={`px-2 py-1.5 rounded text-[11px] border text-center font-mono transition-colors ${
                      activeLayout === l.id
                        ? 'bg-[#2962ff] text-white border-[#2962ff]'
                        : isDark
                        ? 'border-[#2a2e39] hover:bg-[#2a2e39]'
                        : 'border-[#e0e3eb] hover:bg-[#f0f3fa]'
                    }`}
                  >
                    {l.id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cloud Auto-save Status */}
        <div
          className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded text-[11px] text-gray-400 font-medium ${
            isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-[#f0f3fa]'
          }`}
          title="Autosaved to Cloud"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#089981] animate-pulse" />
          <span>Autosaved</span>
        </div>

        {/* Chart Settings Gear */}
        <button
          id="top-settings-btn"
          onClick={onOpenSettingsModal}
          className={`p-1.5 rounded transition-colors ${isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-[#f0f3fa]'}`}
          title="Chart Settings"
        >
          <Settings className="w-4 h-4 text-gray-400 hover:text-white" />
        </button>

        {/* Fullscreen Toggle */}
        <button
          id="top-fullscreen-btn"
          onClick={() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen();
            } else {
              document.exitFullscreen();
            }
          }}
          className={`p-1.5 rounded transition-colors ${isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-[#f0f3fa]'}`}
          title="Toggle Fullscreen"
        >
          <Maximize className="w-4 h-4 text-gray-400 hover:text-white" />
        </button>

        {/* Snapshot / Camera */}
        <button
          id="top-snapshot-btn"
          onClick={onOpenSnapshotModal}
          className={`p-1.5 rounded transition-colors ${isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-[#f0f3fa]'}`}
          title="Take a Snapshot / Share"
        >
          <Camera className="w-4 h-4 text-gray-400 hover:text-white" />
        </button>

        <div className="h-4 w-[1px] bg-gray-500/20" />

        {/* Dark / Light Theme Toggle */}
        <button
          id="theme-toggle-btn"
          onClick={onToggleTheme}
          className={`p-1.5 rounded transition-colors ${isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-[#f0f3fa]'}`}
          title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-[#ff9800]" />
          ) : (
            <Moon className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {/* User Profile Avatar */}
        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#2962ff] to-[#e040fb] flex items-center justify-center text-white text-[10px] font-bold shadow-xs cursor-pointer">
          TV
        </div>
      </div>
    </header>
  );
};
