import React, { useState } from 'react';
import { IndicatorConfig } from '../../types/trading';
import { Search, X, Star, SlidersHorizontal, Check, TrendingUp, BarChart2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  indicators: IndicatorConfig[];
  onToggleIndicator: (id: string) => void;
  onAddCustomIndicator: (ind: IndicatorConfig) => void;
  theme: 'dark' | 'light';
}

const BUILT_IN_INDICATORS = [
  { id: 'ema20', name: 'EMA 20 (Exponential Moving Average)', shortName: 'EMA 20', type: 'overlay' as const, color: '#2962ff', desc: 'A 20-period trend follower giving greater weight to recent prices.' },
  { id: 'ema50', name: 'EMA 50 (Medium Trend Line)', shortName: 'EMA 50', type: 'overlay' as const, color: '#ff9800', desc: 'Intermediate trend filter used by institutional traders.' },
  { id: 'ema200', name: 'EMA 200 (Long-Term Trend Baseline)', shortName: 'EMA 200', type: 'overlay' as const, color: '#e040fb', desc: 'Major long-term market structure dividing bull and bear regimes.' },
  { id: 'sma20', name: 'SMA 20 (Simple Moving Average)', shortName: 'SMA 20', type: 'overlay' as const, color: '#ffeb3b', desc: 'Classic 20-period simple moving average baseline.' },
  { id: 'bb', name: 'Bollinger Bands (20, 2)', shortName: 'BB', type: 'overlay' as const, color: '#2962ff', desc: 'Volatility bands with 2 standard deviations around a 20 SMA.' },
  { id: 'supertrend', name: 'SuperTrend (10, 3)', shortName: 'SuperTrend', type: 'overlay' as const, color: '#089981', desc: 'Trend-following indicator using ATR bands to identify reversals.' },
  { id: 'vwap', name: 'VWAP (Volume Weighted Average Price)', shortName: 'VWAP', type: 'overlay' as const, color: '#ff5722', desc: 'Benchmark used by institutions for intra-day fair value.' },
  { id: 'rsi', name: 'RSI (Relative Strength Index 14)', shortName: 'RSI', type: 'pane' as const, color: '#e040fb', desc: 'Momentum oscillator measuring speed and change of price moves.' },
  { id: 'macd', name: 'MACD (12, 26, 9)', shortName: 'MACD', type: 'pane' as const, color: '#2962ff', desc: 'Moving Average Convergence Divergence trend and momentum metric.' },
];

export const IndicatorsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  indicators,
  onToggleIndicator,
  onAddCustomIndicator,
  theme,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'technicals' | 'strategies' | 'favorites'>('technicals');
  const [favorites, setFavorites] = useState<string[]>(['rsi', 'ema20', 'bb', 'macd']);
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const toggleFav = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (favorites.includes(id)) {
      setFavorites(favorites.filter((f) => f !== id));
    } else {
      setFavorites([...favorites, id]);
    }
  };

  const filtered = BUILT_IN_INDICATORS.filter((ind) => {
    if (category === 'favorites' && !favorites.includes(ind.id)) return false;
    if (query && !ind.name.toLowerCase().includes(query.toLowerCase()) && !ind.desc.toLowerCase().includes(query.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div
        id="indicators-library-modal"
        className={`w-full max-w-2xl rounded-xl shadow-2xl border flex flex-col overflow-hidden max-h-[85vh] animate-in fade-in zoom-in-95 duration-150 ${
          isDark ? 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
        }`}
      >
        {/* Header */}
        <div className={`p-3 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
          <div className="flex items-center gap-2 font-bold text-sm">
            <SlidersHorizontal className="w-4 h-4 text-[#2962ff]" />
            <span>Indicators, Metrics & Strategies</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className={`p-3 border-b flex items-center gap-2 ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-[#f8fafc]'}`}>
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search indicator by name (e.g. RSI, MACD, Bollinger, EMA)..."
            autoFocus
            className="flex-1 bg-transparent text-xs font-medium outline-none"
          />
        </div>

        {/* Categories */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Category Menu */}
          <div className={`w-44 border-r p-2 flex flex-col gap-1 text-xs font-medium ${
            isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-gray-50'
          }`}>
            {[
              { id: 'technicals', label: 'Technicals' },
              { id: 'favorites', label: `Favorites (${favorites.length})` },
              { id: 'strategies', label: 'Strategies' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id as any)}
                className={`w-full text-left px-3 py-2 rounded transition-colors ${
                  category === cat.id
                    ? 'bg-[#2962ff] text-white font-semibold'
                    : isDark
                    ? 'hover:bg-[#2a2e39] text-gray-300'
                    : 'hover:bg-gray-200 text-gray-700'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Right Indicator Items List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-500/10 p-2 no-scrollbar">
            {filtered.map((item) => {
              const active = indicators.find((ind) => ind.id === item.id);
              const isEnabled = active && active.visible;
              const isFav = favorites.includes(item.id);

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (active) {
                      onToggleIndicator(item.id);
                    } else {
                      onAddCustomIndicator({
                        id: item.id,
                        name: item.name,
                        shortName: item.shortName,
                        type: item.type,
                        visible: true,
                        color: item.color,
                        params: {},
                      });
                    }
                  }}
                  className={`p-3 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                    isEnabled
                      ? isDark
                        ? 'bg-[#2962ff]/10 border border-[#2962ff]/30'
                        : 'bg-[#2962ff]/5 border border-[#2962ff]/30'
                      : isDark
                      ? 'hover:bg-[#2a2e39]'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      onClick={(e) => toggleFav(item.id, e)}
                      className={`p-0.5 mt-0.5 rounded transition-colors ${
                        isFav ? 'text-[#ff9800]' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                    </button>

                    <div>
                      <div className="font-bold text-xs flex items-center gap-2">
                        <span>{item.name}</span>
                        <span className="text-[9px] uppercase font-semibold px-1 py-0.2 rounded bg-gray-500/20 text-gray-400">
                          {item.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>

                  <div className="pl-3">
                    <button
                      className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors ${
                        isEnabled
                          ? 'bg-[#089981] text-white'
                          : 'bg-[#2962ff] text-white hover:bg-[#1e53e5]'
                      }`}
                    >
                      {isEnabled ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Active</span>
                        </>
                      ) : (
                        <span>Apply</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
