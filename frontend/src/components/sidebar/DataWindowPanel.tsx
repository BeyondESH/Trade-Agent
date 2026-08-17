import React, { useEffect, useState } from 'react';
import { SymbolInfo, Candle, IndicatorConfig } from '../../types/trading';
import { Layers, Activity } from 'lucide-react';
import {
  fetchMarketPulse,
  extractSeries,
  type MarketPulseEntry,
} from '../../lib/marketPulse';

interface Props {
  symbol: SymbolInfo;
  activeCandle: Candle | null;
  indicators: IndicatorConfig[];
  theme: 'dark' | 'light';
}

const Sparkline: React.FC<{ values: number[]; dark: boolean }> = ({ values, dark }) => {
  if (values.length < 2) return null;
  const w = 96;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`)
    .join(' ');
  const up = values[values.length - 1] >= values[0];
  const color = up ? '#089981' : '#f23645';
  return (
    <svg width={w} height={h} className="ml-auto">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
      <polygon
        points={`0,${h} ${pts} ${w},${h}`}
        fill={color}
        opacity="0.12"
      />
    </svg>
  );
};

export const DataWindowPanel: React.FC<Props> = ({
  symbol,
  activeCandle,
  indicators,
  theme,
}) => {
  const isDark = theme === 'dark';
  const [pulse, setPulse] = useState<MarketPulseEntry[]>([]);
  const [pulseLoading, setPulseLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchMarketPulse().then((rows) => {
      if (!alive) return;
      setPulse(rows);
      setPulseLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const dxy = pulse.find((p) => p.endpoint === 'dxy');
  const dxySeries = dxy ? extractSeries(dxy.raw) : [];

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

        {/* Market Pulse — BlockBeats global metrics */}
        <div className={`p-2.5 rounded-lg border flex flex-col gap-1.5 ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-[#f8fafc] border-[#e0e3eb]'}`}>
          <div className="font-sans font-bold text-[11px] text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-[#2962ff]" />
            Market Pulse (BlockBeats)
          </div>
          {pulseLoading && <div className="text-gray-500 font-sans py-1">Loading...</div>}
          {!pulseLoading && pulse.length === 0 && (
            <div className="text-gray-500 font-sans py-1">Unavailable — check BB_API_KEY</div>
          )}
          {pulse.map((p) => (
            <div key={p.endpoint} className="flex items-center gap-2 py-0.5">
              <div className="flex-1 min-w-0">
                <div className="font-sans font-medium text-[11px] text-gray-400 truncate">{p.label}</div>
                <div className="font-mono text-[11px] truncate" title={p.value}>
                  {p.value}
                </div>
              </div>
              {p.endpoint === 'dxy' && <Sparkline values={dxySeries} dark={isDark} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
