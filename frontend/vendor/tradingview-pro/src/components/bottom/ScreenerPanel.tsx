import React, { useState } from 'react';
import { INITIAL_SCREENER_ITEMS } from '../../data/marketData';
import { SymbolInfo } from '../../types/trading';
import { Filter, Search, ArrowUpDown } from 'lucide-react';

interface Props {
  symbols: SymbolInfo[];
  onSelectSymbol: (symbol: SymbolInfo) => void;
  theme: 'dark' | 'light';
}

export const ScreenerPanel: React.FC<Props> = ({ symbols, onSelectSymbol, theme }) => {
  const [filterCat, setFilterCat] = useState<'All' | 'Crypto' | 'Tech' | 'Forex' | 'Commodity'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const isDark = theme === 'dark';

  const filtered = INITIAL_SCREENER_ITEMS.filter((item) => {
    if (filterCat !== 'All' && item.cat !== filterCat) return false;
    if (searchQuery && !item.ticker.toLowerCase().includes(searchQuery.toLowerCase()) && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div id="screener-tab" className="flex flex-col h-full w-full select-none text-xs">
      {/* Search & Filter Header */}
      <div className={`px-3 py-1.5 border-b flex items-center justify-between gap-3 ${isDark ? 'border-[#2a2e39] bg-[#1e222d]' : 'border-[#e0e3eb] bg-[#f0f3fa]'}`}>
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded border w-full ${isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'}`}>
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search screener tickers..."
              className="bg-transparent outline-none w-full text-xs"
            />
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1">
          {(['All', 'Crypto', 'Tech', 'Forex', 'Commodity'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                filterCat === cat
                  ? 'bg-[#2962ff] text-white'
                  : isDark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Screener Table */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] no-scrollbar">
        <table className="w-full text-left">
          <thead>
            <tr className={`border-b text-gray-500 uppercase text-[10px] font-sans ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
              <th className="py-1.5 px-2">Ticker</th>
              <th className="py-1.5 px-2">Name</th>
              <th className="py-1.5 px-2">Price</th>
              <th className="py-1.5 px-2">Change %</th>
              <th className="py-1.5 px-2">Volume</th>
              <th className="py-1.5 px-2">RSI (14)</th>
              <th className="py-1.5 px-2">Technical Rating</th>
              <th className="py-1.5 px-2">Sector</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-500/10">
            {filtered.map((item) => {
              const matchedSymbol = symbols.find((s) => s.id === item.ticker || s.ticker.startsWith(item.ticker));
              const isUp = item.change.startsWith('+');

              return (
                <tr
                  key={item.ticker}
                  onClick={() => matchedSymbol && onSelectSymbol(matchedSymbol)}
                  className={`cursor-pointer transition-colors ${isDark ? 'hover:bg-[#1e222d]' : 'hover:bg-gray-50'}`}
                >
                  <td className="py-1.5 px-2 font-bold text-[#2962ff] font-sans">{item.ticker}</td>
                  <td className="py-1.5 px-2 font-sans">{item.name}</td>
                  <td className="py-1.5 px-2">${item.price.toLocaleString()}</td>
                  <td className={`py-1.5 px-2 font-bold ${isUp ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                    {item.change}
                  </td>
                  <td className="py-1.5 px-2 text-gray-400">{item.vol}</td>
                  <td className="py-1.5 px-2 font-bold">{item.rsi}</td>
                  <td className="py-1.5 px-2 font-sans">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        item.rating.includes('Buy')
                          ? 'bg-[#089981]/20 text-[#089981]'
                          : item.rating.includes('Sell')
                          ? 'bg-[#f23645]/20 text-[#f23645]'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {item.rating}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-gray-400 font-sans">{item.cat}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
