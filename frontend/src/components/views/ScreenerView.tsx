import React, { useMemo, useState } from 'react';
import { SymbolInfo, ThemeMode } from '../../types/trading';
import { Filter, Search, ChevronRight, Download, RefreshCw } from 'lucide-react';
import { t } from '../../lib/i18n';

interface Props {
  symbols: SymbolInfo[];
  onOpenChartWithTicker: (ticker: string) => void;
  theme: ThemeMode;
}

export const ScreenerView: React.FC<Props> = ({ symbols, onOpenChartWithTicker, theme }) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const isDark = theme === 'dark';

  const categories = useMemo(() => {
    const set = new Set<string>(['All']);
    for (const s of symbols) set.add(s.exchange);
    return [...set];
  }, [symbols]);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return symbols.filter((s) => {
      const matchesSearch =
        !q || s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
      const matchesCat = selectedCategory === 'All' || s.exchange === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [symbols, search, selectedCategory]);

  return (
    <div
      id="screener-view"
      className={`flex-1 h-full overflow-y-auto p-4 select-none font-sans flex flex-col ${
        isDark ? 'bg-[#131722] text-[#d1d4dc]' : 'bg-[#f0f3fa] text-[#131722]'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Filter className="w-5 h-5 text-[#ff9800]" />
            <span>{t('Screener 2.0 (Multi-Asset Engine)')}</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Filter 50,000+ global assets by technical indicators, valuation multiples, and price momentum.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
              isDark ? 'bg-[#1e222d] border-[#2a2e39] text-gray-300 hover:text-white' : 'bg-white border-[#e0e3eb]'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('Export CSV')}</span>
          </button>

          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2962ff] text-white text-xs font-semibold hover:bg-[#1e53e5] shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('Auto-Refresh (1s)')}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar Controls */}
      <div className={`p-3 rounded-xl border mb-4 flex items-center justify-between flex-wrap gap-3 ${
        isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
      }`}>
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticker, name..."
              className={`w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs outline-none ${
                isDark ? 'bg-[#131722] border-[#2a2e39] text-white' : 'bg-gray-50 border-[#e0e3eb]'
              }`}
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none ${
              isDark ? 'bg-[#131722] border-[#2a2e39] text-white' : 'bg-gray-50 border-[#e0e3eb]'
            }`}
          >
            <option value="All">{t('All Categories')}</option>
            {categories
              .filter((c) => c !== 'All')
              .map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="font-mono">{filteredItems.length} assets</span>
        </div>
      </div>

      {/* Screener Table */}
      <div className={`flex-1 rounded-xl border overflow-hidden flex flex-col ${
        isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
      }`}>
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className={`border-b text-gray-500 uppercase text-[10px] font-sans ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-gray-50'}`}>
                <th className="py-2.5 px-3">{t('Ticker')}</th>
                <th className="py-2.5 px-3">{t('Asset')}</th>
                <th className="py-2.5 px-3">{t('Category')}</th>
                <th className="py-2.5 px-3">{t('Price')}</th>
                <th className="py-2.5 px-3">{t('Change %')}</th>
                <th className="py-2.5 px-3">24h High</th>
                <th className="py-2.5 px-3">24h Low</th>
                <th className="py-2.5 px-3 text-right">{t('Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-500/10">
              {filteredItems.map((item) => {
                const isUp = item.change24hPercent >= 0;
                return (
                  <tr
                    key={item.id}
                    onClick={() => onOpenChartWithTicker(item.id)}
                    className={`cursor-pointer transition-colors ${
                      isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-bold font-sans text-white">{item.id}</td>
                    <td className="py-2.5 px-3 text-gray-300 font-sans">{item.name}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-sans bg-gray-500/20 text-gray-300">
                        {item.exchange}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold">${item.price.toLocaleString(undefined, { maximumFractionDigits: item.digits })}</td>
                    <td className={`py-2.5 px-3 font-bold ${isUp ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                      {item.change24hPercent >= 0 ? '+' : ''}
                      {item.change24hPercent.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-gray-300">{item.high24h ? item.high24h.toLocaleString(undefined, { maximumFractionDigits: item.digits }) : '-'}</td>
                    <td className="py-2.5 px-3 text-gray-300">{item.low24h ? item.low24h.toLocaleString(undefined, { maximumFractionDigits: item.digits }) : '-'}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenChartWithTicker(item.id);
                        }}
                        className="px-2.5 py-1 rounded bg-[#2962ff] text-white hover:bg-[#1e53e5] font-sans text-xs font-semibold inline-flex items-center gap-1 shadow-xs"
                      >
                        <span>{t('Open')}</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
