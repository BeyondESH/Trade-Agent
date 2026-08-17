import React from 'react';
import { SymbolInfo, Candle, IndicatorConfig } from '../../types/trading';
import { Layers } from 'lucide-react';

interface Props {
  symbol: SymbolInfo;
  activeCandle: Candle | null;
  indicators: IndicatorConfig[];
  theme: 'dark' | 'light';
}

export const DataWindowPanel: React.FC<Props> = ({
  symbol,
  activeCandle,
  indicators,
  theme,
}) => {
  const isDark = theme === 'dark';

  return (
    <div id="data-window-panel" className="flex flex-col h-full w-full select-none text-xs">
      <div className={`p-2.5 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <Layers className="w-4 h-4 text-[#2962ff]" />
          <span>Data Window</span>
        </div>
        <span className="text-[10px] text-gray-500 font-mono">{symbol.ticker}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 font-mono text-xs no-scrollbar">
        {/* Current Bar Info */}
        <div className={`p-2.5 rounded-lg border flex flex-col gap-1.5 ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-[#f8fafc] border-[#e0e3eb]'}`}>
          <div className="font-sans font-bold text-[11px] text-gray-400 uppercase tracking-wider mb-1">
            Price Bar (OHLCV)
          </div>
          {activeCandle ? (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500 font-sans">Open</span>
                <span>{activeCandle.open.toFixed(symbol.digits)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 font-sans">High</span>
                <span>{activeCandle.high.toFixed(symbol.digits)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 font-sans">Low</span>
                <span>{activeCandle.low.toFixed(symbol.digits)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 font-sans">Close</span>
                <span className={activeCandle.close >= activeCandle.open ? 'text-[#089981]' : 'text-[#f23645]'}>
                  {activeCandle.close.toFixed(symbol.digits)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 font-sans">Volume</span>
                <span>{activeCandle.volume.toLocaleString()}</span>
              </div>
            </>
          ) : (
            <div className="text-gray-500 font-sans text-center py-2">No candle data</div>
          )}
        </div>

        {/* Indicators Readings */}
        <div className={`p-2.5 rounded-lg border flex flex-col gap-2 ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-[#f8fafc] border-[#e0e3eb]'}`}>
          <div className="font-sans font-bold text-[11px] text-gray-400 uppercase tracking-wider mb-1">
            Technical Plots
          </div>
          {indicators.map((ind) => (
            <div key={ind.id} className="flex items-center justify-between py-0.5">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ind.color }} />
                <span className="font-sans font-medium">{ind.name}</span>
              </div>
              <span className="text-gray-400">{ind.visible ? 'Active' : 'Hidden'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
