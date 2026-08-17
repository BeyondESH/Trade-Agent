import React, { useState } from 'react';
import { SymbolInfo, ThemeMode } from '../../types/trading';
import { INITIAL_SCREENER_ITEMS } from '../../data/marketData';
import { Filter, Search, ArrowUpDown, ChevronRight, SlidersHorizontal, Download, RefreshCw } from 'lucide-react';

interface Props {
  symbols: SymbolInfo[];
  onOpenChartWithTicker: (ticker: string) => void;
  theme: ThemeMode;
}

export const ScreenerView: React.FC<Props> = ({ symbols, onOpenChartWithTicker, theme }) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [ratingFilter, setRatingFilter] = useState<string>('All');
  const [minRsi, setMinRsi] = useState<number>(0);
  const isDark = theme === 'dark';

  const filteredItems = INITIAL_SCREENER_ITEMS.filter((item) => {
    const matchesSearch =
      item.ticker.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCategory === 'All' || item.cat === selectedCategory;
    const matchesRating = ratingFilter === 'All' || item.rating === ratingFilter;
    const matchesRsi = item.rsi >= minRsi;
    return matchesSearch && matchesCat && matchesRating && matchesRsi;
  });

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
            <span>Screener 2.0 (Multi-Asset Engine)</span>
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
            <span>Export CSV</span>
          </button>

          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2962ff] text-white text-xs font-semibold hover:bg-[#1e53e5] shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Auto-Refresh (1s)</span>
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
            <option value="All">All Categories</option>
            <option value="Crypto">Crypto</option>
            <option value="Technology">Technology</option>
            <option value="Consumer Cyclical">Consumer Cyclical</option>
            <option value="Communication">Communication</option>
            <option value="Commodities">Commodities</option>
            <option value="Indices">Indices</option>
            <option value="Forex">Forex</option>
          </select>

          {/* Technical Rating Filter */}
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none ${
              isDark ? 'bg-[#131722] border-[#2a2e39] text-white' : 'bg-gray-50 border-[#e0e3eb]'
            }`}
          >
            <option value="All">All Ratings</option>
            <option value="Strong Buy">Strong Buy</option>
            <option value="Buy">Buy</option>
            <option value="Neutral">Neutral</option>
            <option value="Sell">Sell</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Min RSI (14):</span>
          <input
            type="range"
            min="0"
            max="80"
            value={minRsi}
            onChange={(e) => setMinRsi(Number(e.target.value))}
            className="accent-[#2962ff] w-24 cursor-pointer"
          />
          <span className="font-mono font-bold text-white w-6">{minRsi}</span>
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
                <th className="py-2.5 px-3">Ticker</th>
                <th className="py-2.5 px-3">Company / Asset</th>
                <th className="py-2.5 px-3">Sector</th>
                <th className="py-2.5 px-3">Price</th>
                <th className="py-2.5 px-3">Change %</th>
                <th className="py-2.5 px-3">Volume</th>
                <th className="py-2.5 px-3">RSI (14)</th>
                <th className="py-2.5 px-3">P/E Ratio</th>
                <th className="py-2.5 px-3">Market Cap</th>
                <th className="py-2.5 px-3">Technical Rating</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-500/10">
              {filteredItems.map((item) => {
                const isUp = item.change.startsWith('+');
                return (
                  <tr
                    key={item.ticker}
                    onClick={() => onOpenChartWithTicker(item.ticker)}
                    className={`cursor-pointer transition-colors ${
                      isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-bold font-sans text-white">{item.ticker}</td>
                    <td className="py-2.5 px-3 text-gray-300 font-sans">{item.name}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-sans bg-gray-500/20 text-gray-300">
                        {item.cat}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold">${item.price.toLocaleString()}</td>
                    <td className={`py-2.5 px-3 font-bold ${isUp ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                      {item.change}
                    </td>
                    <td className="py-2.5 px-3 text-gray-300">{item.vol}</td>
                    <td className="py-2.5 px-3 font-bold text-[#e040fb]">{item.rsi}</td>
                    <td className="py-2.5 px-3 text-gray-400">{item.pe}</td>
                    <td className="py-2.5 px-3 font-bold text-gray-200">{item.mktCap}</td>
                    <td className="py-2.5 px-3 font-sans">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.rating === 'Strong Buy'
                          ? 'bg-[#089981]/20 text-[#089981]'
                          : item.rating === 'Buy'
                          ? 'bg-[#089981]/15 text-[#089981]'
                          : item.rating === 'Sell'
                          ? 'bg-[#f23645]/20 text-[#f23645]'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {item.rating}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenChartWithTicker(item.ticker);
                        }}
                        className="px-2.5 py-1 rounded bg-[#2962ff] text-white hover:bg-[#1e53e5] font-sans text-xs font-semibold inline-flex items-center gap-1 shadow-xs"
                      >
                        <span>Open</span>
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
