import React, { useState } from 'react';
import { SymbolInfo } from '../../types/trading';
import { Search, X, TrendingUp, DollarSign, Globe, Star, Clock } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  symbols: SymbolInfo[];
  onSelectSymbol: (symbol: SymbolInfo) => void;
  theme: 'dark' | 'light';
}

type TabType = 'all' | 'crypto' | 'stocks' | 'forex' | 'indices' | 'commodities';

export const SymbolSearchModal: React.FC<Props> = ({
  isOpen,
  onClose,
  symbols,
  onSelectSymbol,
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [query, setQuery] = useState('');
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const filtered = symbols.filter((s) => {
    if (activeTab !== 'all' && s.category !== activeTab) return false;
    if (
      query &&
      !s.ticker.toLowerCase().includes(query.toLowerCase()) &&
      !s.name.toLowerCase().includes(query.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div
        id="symbol-search-modal"
        className={`w-full max-w-xl rounded-xl shadow-2xl border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
          isDark ? 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
        }`}
      >
        {/* Search Header */}
        <div className={`p-3 border-b flex items-center gap-3 ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
          <Search className="w-5 h-5 text-[#2962ff] flex-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol, currency, stock or coin..."
            autoFocus
            className="flex-1 bg-transparent text-sm font-medium outline-none placeholder-gray-500"
          />
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Categories Bar */}
        <div className={`flex items-center gap-1 px-3 py-2 border-b overflow-x-auto no-scrollbar ${
          isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-[#f8fafc]'
        }`}>
          {[
            { id: 'all', label: 'All' },
            { id: 'crypto', label: 'Crypto' },
            { id: 'stocks', label: 'Stocks' },
            { id: 'forex', label: 'Forex' },
            { id: 'indices', label: 'Indices' },
            { id: 'commodities', label: 'Commodities' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#2962ff] text-white'
                  : isDark
                  ? 'text-gray-400 hover:text-white hover:bg-[#2a2e39]'
                  : 'text-gray-600 hover:text-black hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Symbol Results List */}
        <div className="max-h-96 overflow-y-auto divide-y divide-gray-500/10 p-1 no-scrollbar">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-xs">
              No matching instruments found for "{query}"
            </div>
          ) : (
            filtered.map((sym) => {
              const isUp = sym.change24hPercent >= 0;
              return (
                <div
                  key={sym.id}
                  onClick={() => {
                    onSelectSymbol(sym);
                    onClose();
                  }}
                  className={`p-3 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                    isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#2962ff]/10 text-[#2962ff] flex items-center justify-center font-bold text-xs">
                      {sym.ticker.slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-sm">
                        <span>{sym.ticker}</span>
                        <span className="text-[10px] text-gray-400 uppercase font-semibold px-1 py-0.2 rounded bg-gray-500/15">
                          {sym.exchange}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">{sym.name}</div>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="font-bold text-sm">${sym.price.toLocaleString(undefined, { minimumFractionDigits: sym.digits })}</div>
                    <div className={`text-xs font-semibold ${isUp ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                      {isUp ? '+' : ''}
                      {sym.change24hPercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
