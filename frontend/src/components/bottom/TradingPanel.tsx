import React, { useState } from 'react';
import { t } from '../../lib/i18n';
import { Position, Order, AccountState, SymbolInfo } from '../../types/trading';
import { Plus, XCircle, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

interface Props {
  account: AccountState;
  positions: Position[];
  orders: Order[];
  onClosePosition: (id: string) => void;
  onCancelOrder: (id: string) => void;
  onOpenOrderModal: (side: 'BUY' | 'SELL') => void;
  theme: 'dark' | 'light';
}

export const TradingPanel: React.FC<Props> = ({
  account,
  positions,
  orders,
  onClosePosition,
  onCancelOrder,
  onOpenOrderModal,
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'history' | 'account'>('positions');
  const isDark = theme === 'dark';

  return (
    <div id="trading-panel-tab" className="flex flex-col h-full w-full select-none text-xs">
      {/* Top Account Header Ribbon */}
      <div className={`px-4 py-2 border-b flex items-center justify-between flex-wrap gap-4 ${isDark ? 'border-[#2a2e39] bg-[#1e222d]' : 'border-[#e0e3eb] bg-[#f0f3fa]'}`}>
        <div className="flex items-center gap-6">
          <div>
            <div className="text-[10px] text-gray-500 font-semibold uppercase">{t('Account Balance')}</div>
            <div className="font-mono font-bold text-sm">
              ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-gray-500 font-semibold uppercase">{t('Equity')}</div>
            <div className="font-mono font-bold text-sm text-[#2962ff]">
              ${account.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-gray-500 font-semibold uppercase">{t('Unrealized P&L')}</div>
            <div
              className={`font-mono font-bold text-sm ${
                account.unrealizedPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
              }`}
            >
              {account.unrealizedPnl >= 0 ? '+' : ''}$
              {account.unrealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-gray-500 font-semibold uppercase">{t('Used / Free Margin')}</div>
            <div className="font-mono font-bold text-sm">
              ${account.usedMargin.toLocaleString()} / ${account.freeMargin.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenOrderModal('BUY')}
            className="flex items-center gap-1 px-3 py-1 rounded bg-[#089981] hover:bg-[#067a67] text-white font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('Buy / Long')}</span>
          </button>
          <button
            onClick={() => onOpenOrderModal('SELL')}
            className="flex items-center gap-1 px-3 py-1 rounded bg-[#f23645] hover:bg-[#d02534] text-white font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('Sell / Short')}</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className={`flex items-center gap-1 px-3 border-b ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-white'}`}>
        {[
          { id: 'positions', label: `Positions (${positions.length})` },
          { id: 'orders', label: `Working Orders (${orders.length})` },
          { id: 'history', label: 'Trade History' },
          { id: 'account', label: 'Broker Summary' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-[#2962ff] text-[#2962ff] font-semibold'
                : isDark
                ? 'border-transparent text-gray-400 hover:text-white'
                : 'border-transparent text-gray-600 hover:text-black'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tables Content */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px]">
        {activeTab === 'positions' && (
          positions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500 font-sans">
              <DollarSign className="w-8 h-8 opacity-20 mb-1" />
              <span>{t('No open positions. Use Buy or Sell above to place paper trade.')}</span>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className={`border-b text-gray-500 uppercase text-[10px] font-sans ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
                  <th className="py-1.5 px-2">{t('Symbol')}</th>
                  <th className="py-1.5 px-2">{t('Side')}</th>
                  <th className="py-1.5 px-2">{t('Size')}</th>
                  <th className="py-1.5 px-2">{t('Entry Price')}</th>
                  <th className="py-1.5 px-2">{t('Mark Price')}</th>
                  <th className="py-1.5 px-2">{t('Margin')}</th>
                  <th className="py-1.5 px-2">{t('Take Profit')}</th>
                  <th className="py-1.5 px-2">{t('Stop Loss')}</th>
                  <th className="py-1.5 px-2">{t('Unrealized P&L')}</th>
                  <th className="py-1.5 px-2">{t('Action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-500/10">
                {positions.map((pos) => {
                  const isProfit = pos.unrealizedPnl >= 0;
                  return (
                    <tr key={pos.id} className={isDark ? 'hover:bg-[#1e222d]' : 'hover:bg-gray-50'}>
                      <td className="py-1.5 px-2 font-bold font-sans">{pos.symbol}</td>
                      <td className={`py-1.5 px-2 font-bold ${pos.side === 'LONG' ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                        {pos.side} {pos.leverage}x
                      </td>
                      <td className="py-1.5 px-2">{pos.amount}</td>
                      <td className="py-1.5 px-2">${pos.entryPrice.toLocaleString()}</td>
                      <td className="py-1.5 px-2">${pos.currentPrice.toLocaleString()}</td>
                      <td className="py-1.5 px-2">${pos.margin.toFixed(2)}</td>
                      <td className="py-1.5 px-2">{pos.tp ? `$${pos.tp}` : '-'}</td>
                      <td className="py-1.5 px-2">{pos.sl ? `$${pos.sl}` : '-'}</td>
                      <td className={`py-1.5 px-2 font-bold ${isProfit ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                        {isProfit ? '+' : ''}${pos.unrealizedPnl.toFixed(2)} ({isProfit ? '+' : ''}{pos.unrealizedPnlPercent.toFixed(2)}%)
                      </td>
                      <td className="py-1.5 px-2">
                        <button
                          onClick={() => onClosePosition(pos.id)}
                          className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 font-sans font-medium transition-colors"
                        >
                          Market Close
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'orders' && (
          orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500 font-sans">
              <span>{t('No pending limit or stop orders.')}</span>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className={`border-b text-gray-500 uppercase text-[10px] font-sans ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
                  <th className="py-1.5 px-2">{t('Symbol')}</th>
                  <th className="py-1.5 px-2">{t('Type')}</th>
                  <th className="py-1.5 px-2">{t('Side')}</th>
                  <th className="py-1.5 px-2">{t('Price')}</th>
                  <th className="py-1.5 px-2">{t('Amount')}</th>
                  <th className="py-1.5 px-2">{t('Filled')}</th>
                  <th className="py-1.5 px-2">{t('Action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-500/10">
                {orders.map((ord) => (
                  <tr key={ord.id} className={isDark ? 'hover:bg-[#1e222d]' : 'hover:bg-gray-50'}>
                    <td className="py-1.5 px-2 font-bold font-sans">{ord.symbol}</td>
                    <td className="py-1.5 px-2">{ord.type}</td>
                    <td className={`py-1.5 px-2 font-bold ${ord.side === 'BUY' ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                      {ord.side}
                    </td>
                    <td className="py-1.5 px-2">${ord.price.toLocaleString()}</td>
                    <td className="py-1.5 px-2">{ord.amount}</td>
                    <td className="py-1.5 px-2">{ord.filled}</td>
                    <td className="py-1.5 px-2">
                      <button
                        onClick={() => onCancelOrder(ord.id)}
                        className="px-2 py-0.5 rounded bg-gray-500/20 hover:bg-gray-500/30 text-gray-400 font-sans"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'account' && (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 font-sans">
            <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-[#f8fafc] border-[#e0e3eb]'}`}>
              <div className="text-gray-500 text-[10px]">{t('Broker')}</div>
              <div className="font-bold text-sm text-[#2962ff]">{t('TradingView Simulated Paper Broker')}</div>
            </div>
            <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-[#f8fafc] border-[#e0e3eb]'}`}>
              <div className="text-gray-500 text-[10px]">{t('Account Currency')}</div>
              <div className="font-bold text-sm">USD ($)</div>
            </div>
            <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-[#f8fafc] border-[#e0e3eb]'}`}>
              <div className="text-gray-500 text-[10px]">{t('Max Leverage')}</div>
              <div className="font-bold text-sm">100x Cross Margin</div>
            </div>
            <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-[#f8fafc] border-[#e0e3eb]'}`}>
              <div className="text-gray-500 text-[10px]">{t('Execution Latency')}</div>
              <div className="font-bold text-sm text-[#089981]">{t('Instant (0ms)')}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
