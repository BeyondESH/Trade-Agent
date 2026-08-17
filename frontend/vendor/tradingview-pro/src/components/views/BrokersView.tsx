import React, { useState } from 'react';
import { BrokerAccount, AccountState, Position, Order, ThemeMode } from '../../types/trading';
import { BROKERS_CATALOG } from '../../data/marketData';
import {
  Briefcase,
  CheckCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  DollarSign,
  Zap,
  ExternalLink,
} from 'lucide-react';

interface Props {
  account: AccountState;
  positions: Position[];
  orders: Order[];
  onResetPaperAccount: () => void;
  onOpenOrderModal: (side: 'BUY' | 'SELL') => void;
  theme: ThemeMode;
}

export const BrokersView: React.FC<Props> = ({
  account,
  positions,
  orders,
  onResetPaperAccount,
  onOpenOrderModal,
  theme,
}) => {
  const [brokers, setBrokers] = useState<BrokerAccount[]>(BROKERS_CATALOG);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const isDark = theme === 'dark';

  const handleToggleConnect = (id: string) => {
    if (id === 'paper-tv') return; // Always connected
    setConnectingId(id);
    setTimeout(() => {
      setBrokers((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, status: b.status === 'connected' ? 'disconnected' : 'connected' } : b
        )
      );
      setConnectingId(null);
    }, 800);
  };

  return (
    <div
      id="brokers-view"
      className={`flex-1 h-full overflow-y-auto p-4 select-none font-sans flex flex-col ${
        isDark ? 'bg-[#131722] text-[#d1d4dc]' : 'bg-[#f0f3fa] text-[#131722]'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-[#089981]" />
            <span>Trading Panel & Broker Integrations</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Connect live exchange accounts or practice risk-free with TradingView Paper Trading engine.
          </p>
        </div>

        {/* Account Quick Status Badge */}
        <div className={`px-4 py-2 rounded-xl border flex items-center gap-4 ${
          isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
        }`}>
          <div>
            <div className="text-[10px] text-gray-400 font-semibold uppercase">Active Paper Balance</div>
            <div className="font-mono font-bold text-sm text-[#089981]">
              ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <button
            onClick={onResetPaperAccount}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-gray-500/20 hover:bg-gray-500/30 text-gray-300 text-xs font-semibold transition-colors"
            title="Reset Paper Account to $50,000"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Funds</span>
          </button>
        </div>
      </div>

      {/* Active Account Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'}`}>
          <div className="text-gray-400 text-[10px] uppercase font-semibold">Total Equity</div>
          <div className="font-mono font-bold text-base text-[#2962ff] my-0.5">
            ${account.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-gray-500">Live Margin Valuation</div>
        </div>

        <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'}`}>
          <div className="text-gray-400 text-[10px] uppercase font-semibold">Unrealized P&L</div>
          <div className={`font-mono font-bold text-base my-0.5 ${account.unrealizedPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}`}>
            {account.unrealizedPnl >= 0 ? '+' : ''}${account.unrealizedPnl.toFixed(2)}
          </div>
          <div className="text-[10px] text-gray-500">{positions.length} Open Positions</div>
        </div>

        <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'}`}>
          <div className="text-gray-400 text-[10px] uppercase font-semibold">Used Margin</div>
          <div className="font-mono font-bold text-base my-0.5 text-white">
            ${account.usedMargin.toLocaleString()}
          </div>
          <div className="text-[10px] text-gray-500">Cross Leverage 10x</div>
        </div>

        <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'}`}>
          <div className="text-gray-400 text-[10px] uppercase font-semibold">Free Margin</div>
          <div className="font-mono font-bold text-base my-0.5 text-[#089981]">
            ${account.freeMargin.toLocaleString()}
          </div>
          <div className="text-[10px] text-gray-500">Available for Trading</div>
        </div>
      </div>

      {/* Supported Brokers Catalog Grid */}
      <h2 className="font-bold text-sm text-white mb-3 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-[#2962ff]" />
        <span>Verified TradingView Broker Integrations</span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {brokers.map((broker) => {
          const isConnected = broker.status === 'connected';
          const isLoading = connectingId === broker.id;

          return (
            <div
              key={broker.id}
              className={`p-4 rounded-xl border flex flex-col justify-between transition-all hover:border-[#2962ff] ${
                isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-[#2962ff] text-white flex items-center justify-center font-bold text-xs shadow-md">
                      {broker.logo}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">{broker.name}</div>
                      <div className="text-[11px] text-gray-400">{broker.type}</div>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${
                      isConnected
                        ? 'bg-[#089981]/20 text-[#089981]'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[#089981]' : 'bg-gray-500'}`} />
                    <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                  </span>
                </div>

                <p className="text-xs text-gray-300 mb-3 leading-relaxed">
                  {broker.description}
                </p>

                {/* Features */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {broker.features.map((f) => (
                    <span
                      key={f}
                      className="px-2 py-0.5 rounded text-[10px] bg-gray-500/10 text-gray-300 font-medium"
                    >
                      ✓ {f}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-3 border-t border-gray-500/20 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">
                  {broker.supportedAssets.slice(0, 3).join(', ')}
                </span>

                <button
                  onClick={() => handleToggleConnect(broker.id)}
                  disabled={isLoading || broker.id === 'paper-tv'}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    broker.id === 'paper-tv'
                      ? 'bg-[#089981]/20 text-[#089981] cursor-default'
                      : isConnected
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'bg-[#2962ff] text-white hover:bg-[#1e53e5]'
                  }`}
                >
                  {isLoading
                    ? 'Connecting...'
                    : broker.id === 'paper-tv'
                    ? 'Active Engine'
                    : isConnected
                    ? 'Disconnect'
                    : 'Connect Account'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
