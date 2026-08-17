import React from 'react';
import { SymbolInfo, Candle, IndicatorConfig, Timeframe } from '../../types/trading';
import { Eye, EyeOff, Settings, X, ChevronDown } from 'lucide-react';

interface Props {
  symbol: SymbolInfo;
  timeframe: Timeframe;
  activeCandle: Candle | null;
  prevCandle: Candle | null;
  indicators: IndicatorConfig[];
  onToggleIndicator: (id: string) => void;
  onRemoveIndicator: (id: string) => void;
  onOpenOrderModal: (side: 'BUY' | 'SELL') => void;
  theme: 'dark' | 'light';
  onOpenSymbolSearch: () => void;
}

export const ChartHUD: React.FC<Props> = ({
  symbol,
  timeframe,
  activeCandle,
  prevCandle,
  indicators,
  onToggleIndicator,
  onRemoveIndicator,
  onOpenOrderModal,
  theme,
  onOpenSymbolSearch,
}) => {
  const isDark = theme === 'dark';
  const candle = activeCandle;

  const change = candle && prevCandle ? candle.close - prevCandle.close : symbol.change24h;
  const changePct = candle && prevCandle
    ? ((candle.close - prevCandle.close) / prevCandle.close) * 100
    : symbol.change24hPercent;
  const isUp = change >= 0;

  const formatPrice = (p: number) => {
    return p.toLocaleString(undefined, {
      minimumFractionDigits: symbol.digits,
      maximumFractionDigits: symbol.digits,
    });
  };

  return (
    <div
      id="chart-hud-overlay"
      className="absolute top-2 left-3 z-20 pointer-events-auto flex flex-col gap-1.5 select-none font-sans text-xs"
    >
      {/* Top Main Status Row */}
      <div className="flex items-center flex-wrap gap-2.5">
        {/* Symbol and Timeframe Badge */}
        <div
          onClick={onOpenSymbolSearch}
          className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer font-bold transition-colors ${
            isDark
              ? 'bg-[#1e222d]/80 hover:bg-[#2a2e39] text-[#d1d4dc]'
              : 'bg-white/80 hover:bg-[#f0f3fa] text-[#131722] shadow-xs'
          }`}
        >
          <span className="text-sm tracking-tight text-[#2962ff]">{symbol.ticker}</span>
          <span className="text-[11px] text-gray-400 font-medium">· {timeframe}</span>
          <span className="text-[10px] text-gray-500 uppercase font-semibold">{symbol.exchange}</span>
          <ChevronDown className="w-3 h-3 text-gray-400" />
        </div>

        {/* OHLC Readings */}
        {candle && (
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <div className="flex items-center gap-1">
              <span className="text-gray-500 font-medium">O</span>
              <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{formatPrice(candle.open)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500 font-medium">H</span>
              <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{formatPrice(candle.high)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500 font-medium">L</span>
              <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{formatPrice(candle.low)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500 font-medium">C</span>
              <span className={isUp ? 'text-[#089981]' : 'text-[#f23645]'}>{formatPrice(candle.close)}</span>
            </div>
            <div className="flex items-center gap-1 font-semibold">
              <span className={isUp ? 'text-[#089981]' : 'text-[#f23645]'}>
                {isUp ? '+' : ''}
                {formatPrice(change)} ({isUp ? '+' : ''}
                {changePct.toFixed(2)}%)
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500 font-medium">Vol</span>
              <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                {candle.volume > 1000 ? `${(candle.volume / 1000).toFixed(1)}K` : candle.volume}
              </span>
            </div>
          </div>
        )}

        {/* Quick Buy / Sell Buttons */}
        <div className="flex items-center gap-1 ml-2">
          <button
            id="hud-quick-sell-btn"
            onClick={() => onOpenOrderModal('SELL')}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#f23645]/15 hover:bg-[#f23645]/25 text-[#f23645] border border-[#f23645]/30 font-semibold text-[11px] transition-colors"
          >
            <span>SELL</span>
            <span className="font-mono text-[10px]">
              {candle ? formatPrice(candle.close * 0.9998) : formatPrice(symbol.price * 0.9998)}
            </span>
          </button>
          <button
            id="hud-quick-buy-btn"
            onClick={() => onOpenOrderModal('BUY')}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#089981]/15 hover:bg-[#089981]/25 text-[#089981] border border-[#089981]/30 font-semibold text-[11px] transition-colors"
          >
            <span>BUY</span>
            <span className="font-mono text-[10px]">
              {candle ? formatPrice(candle.close * 1.0002) : formatPrice(symbol.price * 1.0002)}
            </span>
          </button>
        </div>
      </div>

      {/* Active Indicators Stack */}
      <div className="flex flex-col gap-1 pl-1">
        {indicators.map((ind) => (
          <div
            key={ind.id}
            className={`group inline-flex items-center gap-1.5 py-0.5 px-1.5 rounded transition-all max-w-fit ${
              isDark ? 'hover:bg-[#1e222d]/80' : 'hover:bg-white/80'
            }`}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ind.color }} />
            <span className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              {ind.name}
            </span>

            {/* Hover Actions */}
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
              <button
                onClick={() => onToggleIndicator(ind.id)}
                className="p-0.5 text-gray-400 hover:text-white"
                title={ind.visible ? 'Hide Indicator' : 'Show Indicator'}
              >
                {ind.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-gray-500" />}
              </button>
              <button
                onClick={() => onRemoveIndicator(ind.id)}
                className="p-0.5 text-gray-400 hover:text-red-400"
                title="Remove Indicator"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
