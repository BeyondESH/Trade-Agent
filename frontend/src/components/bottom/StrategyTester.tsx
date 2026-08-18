import React, { useState } from 'react';
import { BacktestResult } from '../../types/trading';
import { TrendingUp, Award, BarChart2, ListOrdered, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { t } from '../../lib/i18n';

interface Props {
  result: BacktestResult;
  theme: 'dark' | 'light';
}

export const StrategyTester: React.FC<Props> = ({ result, theme }) => {
  const [tab, setTab] = useState<'overview' | 'trades'>('overview');
  const isDark = theme === 'dark';

  return (
    <div id="strategy-tester-tab" className="flex flex-col h-full w-full select-none text-xs">
      {/* Top Stats Ribbon */}
      <div className={`px-4 py-2 border-b flex items-center justify-between flex-wrap gap-4 ${isDark ? 'border-[#2a2e39] bg-[#1e222d]' : 'border-[#e0e3eb] bg-[#f0f3fa]'}`}>
        <div className="flex items-center gap-6">
          <div>
            <div className="text-[10px] text-gray-500 font-semibold uppercase">{t('Net Profit')}</div>
            <div
              className={`font-mono font-bold text-sm ${
                result.netProfit >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
              }`}
            >
              {result.netProfit >= 0 ? '+' : ''}${result.netProfit.toLocaleString()} ({result.netProfitPercent}%)
            </div>
          </div>

          <div>
            <div className="text-[10px] text-gray-500 font-semibold uppercase">{t('Total Closed Trades')}</div>
            <div className="font-mono font-bold text-sm">{result.totalTrades}</div>
          </div>

          <div>
            <div className="text-[10px] text-gray-500 font-semibold uppercase">{t('Win Rate')}</div>
            <div className="font-mono font-bold text-sm text-[#2962ff]">{result.winRate}%</div>
          </div>

          <div>
            <div className="text-[10px] text-gray-500 font-semibold uppercase">{t('Profit Factor')}</div>
            <div className="font-mono font-bold text-sm">{result.profitFactor}</div>
          </div>

          <div>
            <div className="text-[10px] text-gray-500 font-semibold uppercase">{t('Max Drawdown')}</div>
            <div className="font-mono font-bold text-sm text-[#f23645]">
              -${result.maxDrawdown.toLocaleString()} ({result.maxDrawdownPercent}%)
            </div>
          </div>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('overview')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              tab === 'overview'
                ? 'bg-[#2962ff] text-white'
                : isDark
                ? 'text-gray-400 hover:text-white'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            Overview & Equity
          </button>
          <button
            onClick={() => setTab('trades')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              tab === 'trades'
                ? 'bg-[#2962ff] text-white'
                : isDark
                ? 'text-gray-400 hover:text-white'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            List of Trades ({result.trades.length})
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="flex-1 overflow-y-auto p-3 no-scrollbar">
        {tab === 'overview' ? (
          <div className="flex flex-col gap-4">
            {/* Strategy Title & Description */}
            <div className="flex items-center justify-between">
              <div className="font-bold text-sm text-[#2962ff]">{result.strategyName}</div>
              <span className="text-gray-500 text-[11px]">Sharpe Ratio: {result.sharpeRatio}</span>
            </div>

            {/* Equity Curve Visualizer */}
            <div className={`p-3 rounded-lg border flex flex-col gap-2 ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-[#f8fafc] border-[#e0e3eb]'}`}>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Strategy Equity Curve ($USD)
              </div>
              <div className="h-32 w-full flex items-end gap-1 pt-2">
                {result.equityCurve.map((pt, idx) => {
                  const minEq = 95000;
                  const maxEq = 125000;
                  const heightPct = Math.max(10, Math.min(100, ((pt.equity - minEq) / (maxEq - minEq)) * 100));
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                      <div
                        className="w-full bg-[#2962ff] rounded-t transition-all group-hover:bg-[#089981]"
                        style={{ height: `${heightPct}%` }}
                      />
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-1 z-30 p-1.5 rounded bg-black/90 text-white font-mono text-[10px] pointer-events-none whitespace-nowrap">
                        {pt.time}: ${pt.equity.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* List of Trades Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[11px]">
              <thead>
                <tr className={`border-b text-gray-500 uppercase text-[10px] ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
                  <th className="py-1.5 px-2">{t('Trade #')}</th>
                  <th className="py-1.5 px-2">{t('Type')}</th>
                  <th className="py-1.5 px-2">{t('Entry Date')}</th>
                  <th className="py-1.5 px-2">{t('Entry Price')}</th>
                  <th className="py-1.5 px-2">{t('Exit Date')}</th>
                  <th className="py-1.5 px-2">{t('Exit Price')}</th>
                  <th className="py-1.5 px-2">{t('Profit/Loss')}</th>
                  <th className="py-1.5 px-2">{t('Gain %')}</th>
                  <th className="py-1.5 px-2">{t('Exit Trigger')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-500/10">
                {result.trades.map((t) => {
                  const isWin = t.pnl > 0;
                  return (
                    <tr
                      key={t.id}
                      className={isDark ? 'hover:bg-[#1e222d]' : 'hover:bg-gray-50'}
                    >
                      <td className="py-1.5 px-2 text-gray-400">{t.id}</td>
                      <td className="py-1.5 px-2 font-bold text-[#2962ff]">{t.type}</td>
                      <td className="py-1.5 px-2">{t.entryTime}</td>
                      <td className="py-1.5 px-2">${t.entryPrice.toLocaleString()}</td>
                      <td className="py-1.5 px-2">{t.exitTime}</td>
                      <td className="py-1.5 px-2">${t.exitPrice.toLocaleString()}</td>
                      <td className={`py-1.5 px-2 font-bold ${isWin ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                        {isWin ? '+' : ''}${t.pnl.toLocaleString()}
                      </td>
                      <td className={`py-1.5 px-2 font-bold ${isWin ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                        {isWin ? '+' : ''}{t.pnlPercent}%
                      </td>
                      <td className="py-1.5 px-2 text-gray-400 font-sans">{t.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
