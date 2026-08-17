import React, { useState } from 'react';
import { SymbolInfo } from '../../types/trading';
import { Flame, TrendingUp, TrendingDown, Zap } from 'lucide-react';

interface Props {
  symbols: SymbolInfo[];
  onSelectSymbol: (s: SymbolInfo) => void;
  theme: 'dark' | 'light';
}

export const HotlistsPanel: React.FC<Props> = ({ symbols, onSelectSymbol, theme }) => {
  const [tab, setTab] = useState<'gainers' | 'losers' | 'volume'>('gainers');
  const isDark = theme === 'dark';

  const sortedList = [...symbols].sort((a, b) => {
    if (tab === 'gainers') return b.change24hPercent - a.change24hPercent;
    if (tab === 'losers') return a.change24hPercent - b.change24hPercent;
    return parseFloat(b.volume24h) - parseFloat(a.volume24h);
  });

  return (
    <div id="hotlists-panel" className="flex flex-col h-full w-full select-none text-xs">
      <div className={`p-2.5 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <Flame className="w-4 h-4 text-[#ff9800]" />
          <span>Market Hotlists</span>
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex p-1 border-b ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-white'}`}>
        {[
          { id: 'gainers', label: 'Top Gainers', icon: TrendingUp },
          { id: 'losers', label: 'Top Losers', icon: TrendingDown },
          { id: 'volume', label: 'Volume', icon: Zap },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors flex items-center justify-center gap-1 ${
              tab === t.id
                ? 'bg-[#2962ff] text-white'
                : isDark
                ? 'text-gray-400 hover:text-white'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-500/10 no-scrollbar">
        {sortedList.map((s) => {
          const isUp = s.change24hPercent >= 0;
          return (
            <div
              key={s.id}
              onClick={() => onSelectSymbol(s)}
              className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                isDark ? 'hover:bg-[#1e222d]' : 'hover:bg-gray-50'
              }`}
            >
              <div>
                <div className="font-bold text-xs">{s.ticker}</div>
                <div className="text-[10px] text-gray-400">{s.name}</div>
              </div>
              <div className="text-right font-mono">
                <div className="font-bold text-xs">${s.price.toFixed(s.digits)}</div>
                <div className={`text-[10px] font-bold ${isUp ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                  {isUp ? '+' : ''}
                  {s.change24hPercent.toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
