import React from 'react';
import type { Trade } from '../../hooks/useTrades';

interface Props {
  trades: Trade[];
  precision?: number;
  theme: 'dark' | 'light';
}

function fmtPrice(p: string, precision: number): string {
  const v = Number(p);
  return Number.isNaN(v) ? p : v.toFixed(precision);
}

function fmtTime(ts: string): string {
  const t = Number(ts);
  if (Number.isNaN(t) || t === 0) return '--:--:--';
  return new Date(t).toTimeString().slice(0, 8);
}

export const TradesTape: React.FC<Props> = ({ trades, precision = 2, theme }) => {
  const isDark = theme === 'dark';
  return (
    <div className="flex flex-col h-full min-h-0 text-xs">
      <div
        className={`px-3 py-1.5 border-b font-semibold text-xs uppercase tracking-wide ${
          isDark ? 'border-[#2a2e39] text-[#d1d4dc]' : 'border-[#e0e3eb] text-[#131722]'
        }`}
      >
        最新成交
      </div>
      <div className={`grid grid-cols-[1fr_1fr_auto] px-3 pb-1 text-[10px] font-medium uppercase text-gray-500`}>
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right pl-2">Time</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto font-mono text-[11px]">
        {trades.length === 0 && (
          <div className={`px-3 py-3 text-center text-gray-500`}>暂无成交</div>
        )}
        {trades.map((t, i) => {
          const color = t.side === 'buy' ? 'text-[#089981]' : 'text-[#f23645]';
          return (
            <div
              key={`${t.ts}-${i}`}
              className="grid grid-cols-[1fr_1fr_auto] px-3 py-0.5 items-center"
            >
              <span className={`font-semibold ${color}`}>{fmtPrice(t.price, precision)}</span>
              <span className="text-right text-gray-400">{t.size}</span>
              <span className="text-right pl-2 text-gray-500">{fmtTime(t.ts)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
