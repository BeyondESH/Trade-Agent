import React, { useState } from 'react';
import { SymbolInfo, ThemeMode } from '../../types/trading';
import { MARKETS_OVERVIEW_DATA } from '../../data/marketData';
import { t } from '../../lib/i18n';
import {
  TrendingUp,
  TrendingDown,
  Globe,
  DollarSign,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Layers,
  ChevronRight,
} from 'lucide-react';

interface Props {
  symbols: SymbolInfo[];
  onSelectSymbol: (symbol: SymbolInfo) => void;
  onOpenChartWithSymbol: (symbol: SymbolInfo) => void;
  theme: ThemeMode;
}

export const MarketsView: React.FC<Props> = ({
  symbols,
  onSelectSymbol,
  onOpenChartWithSymbol,
  theme,
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'indices' | 'crypto' | 'forex' | 'commodities'>('all');
  const isDark = theme === 'dark';

  return (
    <div
      id="markets-overview-view"
      className={`flex-1 h-full overflow-y-auto p-4 select-none font-sans ${
        isDark ? 'bg-[#131722] text-[#d1d4dc]' : 'bg-[#f0f3fa] text-[#131722]'
      }`}
    >
      {/* Header Banner */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#2962ff]" />
            <span>{t('Global Markets Overview')}</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Real-time financial benchmarks, international market indices, currencies, and sector velocity.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-black/20 p-1 rounded-lg border border-gray-500/20">
          {(['all', 'indices', 'crypto', 'forex', 'commodities'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeCategory === cat
                  ? 'bg-[#2962ff] text-white shadow-xs'
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

      {/* Top Major Indices Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
        {MARKETS_OVERVIEW_DATA.indices.map((idx, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg border flex flex-col justify-between transition-all hover:border-[#2962ff] cursor-pointer ${
              isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
            }`}
          >
            <div className="text-[11px] font-semibold text-gray-400">{idx.name}</div>
            <div className="font-mono font-bold text-sm my-1">{idx.value}</div>
            <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-[#089981]">
              <ArrowUpRight className="w-3 h-3" />
              <span>{idx.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid: Sector Markets + Watchable Symbols */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        {/* Crypto Movers */}
        <div className={`p-4 rounded-xl border flex flex-col gap-3 ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'}`}>
          <div className="flex items-center justify-between border-b pb-2 border-gray-500/20">
            <span className="font-bold text-sm flex items-center gap-1.5 text-[#ff9800]">
              <Activity className="w-4 h-4" />
              <span>{t('Cryptocurrency Benchmarks')}</span>
            </span>
            <span className="text-[10px] text-gray-500 font-semibold">24h Vol</span>
          </div>

          <div className="flex flex-col gap-2">
            {MARKETS_OVERVIEW_DATA.crypto.map((c, i) => (
              <div
                key={i}
                onClick={() => {
                  const match = symbols.find((s) => s.ticker.includes(c.name.toUpperCase()) || s.id.includes(c.name.toUpperCase()));
                  if (match) onOpenChartWithSymbol(match);
                }}
                className={`p-2 rounded-lg flex items-center justify-between hover:bg-gray-500/10 cursor-pointer transition-colors ${
                  isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'
                }`}
              >
                <div>
                  <div className="font-bold text-xs">{c.name}</div>
                  <div className="font-mono text-gray-400 text-[11px]">{c.value}</div>
                </div>
                <div className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${c.up ? 'bg-[#089981]/20 text-[#089981]' : 'bg-[#f23645]/20 text-[#f23645]'}`}>
                  {c.change}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Forex Markets */}
        <div className={`p-4 rounded-xl border flex flex-col gap-3 ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'}`}>
          <div className="flex items-center justify-between border-b pb-2 border-gray-500/20">
            <span className="font-bold text-sm flex items-center gap-1.5 text-[#00bcd4]">
              <DollarSign className="w-4 h-4" />
              <span>{t('Currencies & Forex')}</span>
            </span>
            <span className="text-[10px] text-gray-500 font-semibold">{t('Daily Pip Delta')}</span>
          </div>

          <div className="flex flex-col gap-2">
            {MARKETS_OVERVIEW_DATA.forex.map((f, i) => (
              <div
                key={i}
                className={`p-2 rounded-lg flex items-center justify-between hover:bg-gray-500/10 cursor-pointer transition-colors ${
                  isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'
                }`}
              >
                <div>
                  <div className="font-bold text-xs">{f.name}</div>
                  <div className="font-mono text-gray-400 text-[11px]">{f.value}</div>
                </div>
                <div className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${f.up ? 'bg-[#089981]/20 text-[#089981]' : 'bg-[#f23645]/20 text-[#f23645]'}`}>
                  {f.change}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Commodities */}
        <div className={`p-4 rounded-xl border flex flex-col gap-3 ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'}`}>
          <div className="flex items-center justify-between border-b pb-2 border-gray-500/20">
            <span className="font-bold text-sm flex items-center gap-1.5 text-[#e040fb]">
              <Layers className="w-4 h-4" />
              <span>{t('Commodities & Energy')}</span>
            </span>
            <span className="text-[10px] text-gray-500 font-semibold">{t('Spot & Futures')}</span>
          </div>

          <div className="flex flex-col gap-2">
            {MARKETS_OVERVIEW_DATA.commodities.map((m, i) => (
              <div
                key={i}
                className={`p-2 rounded-lg flex items-center justify-between hover:bg-gray-500/10 cursor-pointer transition-colors ${
                  isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'
                }`}
              >
                <div>
                  <div className="font-bold text-xs">{m.name}</div>
                  <div className="font-mono text-gray-400 text-[11px]">{m.value}</div>
                </div>
                <div className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${m.up ? 'bg-[#089981]/20 text-[#089981]' : 'bg-[#f23645]/20 text-[#f23645]'}`}>
                  {m.change}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Table: Top Gainers & Active Equities */}
      <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-sm text-white">{t('Active Market Watchlist')}</div>
          <span className="text-xs text-gray-400">{t('Click any instrument to open in SuperCharts')}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className={`border-b text-gray-500 uppercase text-[10px] font-sans ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
                <th className="py-2 px-3">{t('Symbol')}</th>
                <th className="py-2 px-3">{t('Name')}</th>
                <th className="py-2 px-3">{t('Category')}</th>
                <th className="py-2 px-3">{t('Last Price')}</th>
                <th className="py-2 px-3">24h Change</th>
                <th className="py-2 px-3">{t('24h High/Low')}</th>
                <th className="py-2 px-3">{t('Volume')}</th>
                <th className="py-2 px-3">{t('Technical Rating')}</th>
                <th className="py-2 px-3 text-right">{t('Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-500/10">
              {symbols.map((sym) => {
                const isUp = sym.change24hPercent >= 0;
                return (
                  <tr
                    key={sym.id}
                    onClick={() => onOpenChartWithSymbol(sym)}
                    className={`cursor-pointer transition-colors ${
                      isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-100'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-bold font-sans text-white">{sym.ticker}</td>
                    <td className="py-2.5 px-3 text-gray-300 font-sans">{sym.name}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-sans uppercase font-bold bg-[#2962ff]/20 text-[#2962ff]">
                        {sym.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold">${sym.price.toLocaleString(undefined, { minimumFractionDigits: sym.digits })}</td>
                    <td className={`py-2.5 px-3 font-bold ${isUp ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                      {isUp ? '+' : ''}{sym.change24hPercent}%
                    </td>
                    <td className="py-2.5 px-3 text-gray-400">
                      ${sym.high24h.toLocaleString()} / ${sym.low24h.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-gray-300">{sym.volume24h}</td>
                    <td className="py-2.5 px-3 font-sans">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        sym.technicalRating === 'Strong Buy'
                          ? 'bg-[#089981]/20 text-[#089981]'
                          : sym.technicalRating === 'Buy'
                          ? 'bg-[#089981]/15 text-[#089981]'
                          : sym.technicalRating === 'Sell'
                          ? 'bg-[#f23645]/20 text-[#f23645]'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {sym.technicalRating || 'Neutral'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenChartWithSymbol(sym);
                        }}
                        className="px-2.5 py-1 rounded bg-[#2962ff] text-white hover:bg-[#1e53e5] font-sans text-xs font-semibold inline-flex items-center gap-1 shadow-xs"
                      >
                        <span>{t('Chart')}</span>
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
