import React, { useState } from 'react';
import { SymbolInfo } from '../../types/trading';
import { Plus, Search, TrendingUp, TrendingDown, MoreVertical, Star, ChevronDown, Activity } from 'lucide-react';
import { t } from '../../lib/i18n';

interface Props {
  symbols: SymbolInfo[];
  activeSymbol: SymbolInfo;
  onSelectSymbol: (symbol: SymbolInfo) => void;
  onAddSymbol: () => void;
  theme: 'dark' | 'light';
}

export const WatchlistPanel: React.FC<Props> = ({
  symbols,
  activeSymbol,
  onSelectSymbol,
  onAddSymbol,
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<'All' | 'Crypto' | 'Stocks' | 'Forex'>('All');
  const isDark = theme === 'dark';

  const filteredSymbols = symbols.filter((s) => {
    if (activeTab === 'All') return true;
    if (activeTab === 'Crypto') return s.category === 'crypto';
    if (activeTab === 'Stocks') return s.category === 'stocks';
    if (activeTab === 'Forex') return s.category === 'forex' || s.category === 'commodities';
    return true;
  });

  return (
    <div
      id="watchlist-panel"
      className="flex flex-col h-full w-full select-none text-xs"
    >
      {/* Watchlist Header */}
      <div className={`p-2.5 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
        <div className="flex items-center gap-1 font-bold text-sm">
          <span>{t('Watchlist')}</span>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        </div>
        <div className="flex items-center gap-1">
          <button
            id="watchlist-add-symbol-btn"
            onClick={onAddSymbol}
            className={`p-1 rounded hover:bg-gray-500/20 text-[#2962ff] transition-colors`}
            title={t('Add Symbol')}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Category Pills */}
      <div className={`flex items-center gap-1 p-1.5 border-b ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-white'}`}>
        {(['All', 'Crypto', 'Stocks', 'Forex'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              activeTab === cat
                ? 'bg-[#2962ff] text-white'
                : isDark
                ? 'text-gray-400 hover:text-white hover:bg-[#2a2e39]'
                : 'text-gray-600 hover:text-black hover:bg-[#f0f3fa]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Symbol List Table */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-500/10 no-scrollbar">
        {filteredSymbols.map((s) => {
          const isSelected = s.id === activeSymbol.id;
          const isUp = s.change24hPercent >= 0;

          return (
            <div
              key={s.id}
              onClick={() => onSelectSymbol(s)}
              className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                isSelected
                  ? isDark
                    ? 'bg-[#2a2e39]/80 border-l-2 border-[#2962ff]'
                    : 'bg-[#f0f3fa] border-l-2 border-[#2962ff]'
                  : isDark
                  ? 'hover:bg-[#2a2e39]/40'
                  : 'hover:bg-gray-50'
              }`}
            >
              {/* Left ticker */}
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-xs">{s.ticker}</span>
                  <span className="text-[10px] text-gray-500 uppercase">{s.exchange}</span>
                </div>
                <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{s.name}</span>
              </div>

              {/* Right price and change */}
              <div className="flex flex-col items-end">
                <span className="font-mono font-bold text-xs">
                  {s.price.toLocaleString(undefined, {
                    minimumFractionDigits: s.digits,
                    maximumFractionDigits: s.digits,
                  })}
                </span>
                <span
                  className={`font-mono text-[10px] font-semibold px-1 py-0.2 rounded ${
                    isUp ? 'text-[#089981] bg-[#089981]/10' : 'text-[#f23645] bg-[#f23645]/10'
                  }`}
                >
                  {isUp ? '+' : ''}
                  {s.change24hPercent.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Symbol Detail Snapshot */}
      <div className={`p-3 border-t flex flex-col gap-2 ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-[#f8fafc]'}`}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm">{activeSymbol.ticker}</span>
          <span
            className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
              activeSymbol.technicalRating === 'Strong Buy' || activeSymbol.technicalRating === 'Buy'
                ? 'bg-[#089981]/20 text-[#089981]'
                : activeSymbol.technicalRating === 'Strong Sell' || activeSymbol.technicalRating === 'Sell'
                ? 'bg-[#f23645]/20 text-[#f23645]'
                : 'bg-gray-500/20 text-gray-400'
            }`}
          >
            {activeSymbol.technicalRating || 'Neutral'}
          </span>
        </div>

        {/* Day Range Bar */}
        <div className="flex flex-col gap-1 text-[10px] text-gray-400">
          <div className="flex justify-between">
            <span>日内区间</span>
            <span className="font-mono">
              {activeSymbol.low24h.toFixed(activeSymbol.digits)} - {activeSymbol.high24h.toFixed(activeSymbol.digits)}
            </span>
          </div>
          <div className="w-full h-1.5 bg-gray-500/20 rounded-full overflow-hidden relative">
            <div
              className="h-full bg-[#2962ff] rounded-full"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    10,
                    ((activeSymbol.price - activeSymbol.low24h) /
                      (activeSymbol.high24h - activeSymbol.low24h || 1)) *
                      100
                  )
                )}%`,
              }}
            />
          </div>
        </div>

        {/* 52W Range & Market Cap */}
        <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400 pt-1">
          <div>
            <div className="text-gray-500">24小时成交量</div>
            <div className={`font-semibold font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              {activeSymbol.volume24h}
            </div>
          </div>
          <div>
            <div className="text-gray-500">市值</div>
            <div className={`font-semibold font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              {activeSymbol.marketCap || 'N/A'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
