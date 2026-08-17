import React, { useState } from 'react';
import { SymbolInfo, Position, Order } from '../../types/trading';
import { X, TrendingUp, TrendingDown, DollarSign, ShieldAlert } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  symbol: SymbolInfo;
  initialSide: 'BUY' | 'SELL';
  onSubmitOrder: (orderData: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT';
    price: number;
    amount: number;
    leverage: number;
    tp?: number;
    sl?: number;
  }) => void;
  theme: 'dark' | 'light';
}

export const OrderModal: React.FC<Props> = ({
  isOpen,
  onClose,
  symbol,
  initialSide,
  onSubmitOrder,
  theme,
}) => {
  const [side, setSide] = useState<'BUY' | 'SELL'>(initialSide);
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [price, setPrice] = useState<number>(Number(symbol.price.toFixed(symbol.digits)));
  const [amount, setAmount] = useState<number>(1);
  const [leverage, setLeverage] = useState<number>(10);
  const [enableTP, setEnableTP] = useState<boolean>(true);
  const [enableSL, setEnableSL] = useState<boolean>(true);
  const [tpPrice, setTpPrice] = useState<number>(
    side === 'BUY' ? Number((symbol.price * 1.05).toFixed(symbol.digits)) : Number((symbol.price * 0.95).toFixed(symbol.digits))
  );
  const [slPrice, setSlPrice] = useState<number>(
    side === 'BUY' ? Number((symbol.price * 0.97).toFixed(symbol.digits)) : Number((symbol.price * 1.03).toFixed(symbol.digits))
  );

  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const totalValue = price * amount;
  const marginRequired = totalValue / leverage;
  const potentialProfit = Math.abs((tpPrice - price) * amount);
  const potentialLoss = Math.abs((price - slPrice) * amount);
  const rrRatio = potentialLoss > 0 ? (potentialProfit / potentialLoss).toFixed(2) : '1.0';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitOrder({
      symbol: symbol.ticker,
      side,
      type: orderType,
      price,
      amount,
      leverage,
      tp: enableTP ? tpPrice : undefined,
      sl: enableSL ? slPrice : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <form
        onSubmit={handleSubmit}
        id="trading-order-modal"
        className={`w-full max-w-md rounded-xl shadow-2xl border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
          isDark ? 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
        }`}
      >
        {/* Header */}
        <div className={`p-3 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{symbol.ticker}</span>
            <span className="text-xs text-gray-400 font-mono">${symbol.price.toFixed(symbol.digits)}</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Buy / Sell Toggle Tabs */}
        <div className="grid grid-cols-2 p-2 gap-2 border-b border-gray-500/10">
          <button
            type="button"
            onClick={() => setSide('BUY')}
            className={`py-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
              side === 'BUY'
                ? 'bg-[#089981] text-white shadow-md'
                : isDark
                ? 'bg-[#131722] text-gray-400 hover:text-white'
                : 'bg-gray-100 text-gray-600 hover:text-black'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>BUY / LONG</span>
          </button>
          <button
            type="button"
            onClick={() => setSide('SELL')}
            className={`py-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
              side === 'SELL'
                ? 'bg-[#f23645] text-white shadow-md'
                : isDark
                ? 'bg-[#131722] text-gray-400 hover:text-white'
                : 'bg-gray-100 text-gray-600 hover:text-black'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            <span>SELL / SHORT</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 flex flex-col gap-3 text-xs">
          {/* Order Type */}
          <div className="flex gap-2">
            {(['MARKET', 'LIMIT'] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setOrderType(t)}
                className={`flex-1 py-1.5 rounded text-xs font-semibold border transition-colors ${
                  orderType === t
                    ? 'bg-[#2962ff] text-white border-[#2962ff]'
                    : isDark
                    ? 'border-[#2a2e39] hover:bg-[#2a2e39]'
                    : 'border-[#e0e3eb] hover:bg-gray-100'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Limit Price */}
          {orderType === 'LIMIT' && (
            <div>
              <label className="text-gray-400 font-semibold mb-1 block">Limit Price ($)</label>
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className={`w-full p-2 rounded border outline-none font-mono font-bold ${
                  isDark ? 'bg-[#131722] border-[#2a2e39] text-white' : 'bg-white border-[#e0e3eb] text-black'
                }`}
              />
            </div>
          )}

          {/* Amount / Qty */}
          <div>
            <div className="flex justify-between text-gray-400 font-semibold mb-1">
              <span>Order Size ({symbol.baseAsset})</span>
              <span className="font-mono">Value: ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            <input
              type="number"
              step="any"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
              className={`w-full p-2 rounded border outline-none font-mono font-bold ${
                isDark ? 'bg-[#131722] border-[#2a2e39] text-white' : 'bg-white border-[#e0e3eb] text-black'
              }`}
            />
          </div>

          {/* Leverage Slider */}
          <div>
            <div className="flex justify-between text-gray-400 font-semibold mb-1">
              <span>Leverage</span>
              <span className="font-mono text-[#2962ff] font-bold">{leverage}x</span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              className="w-full accent-[#2962ff] cursor-pointer"
            />
          </div>

          {/* TP / SL Group */}
          <div className={`p-2.5 rounded-lg border flex flex-col gap-2 ${
            isDark ? 'bg-[#131722] border-[#2a2e39]' : 'bg-[#f8fafc] border-[#e0e3eb]'
          }`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 cursor-pointer text-[#089981] font-bold">
                <input
                  type="checkbox"
                  checked={enableTP}
                  onChange={(e) => setEnableTP(e.target.checked)}
                  className="accent-[#089981]"
                />
                <span>Take Profit ($)</span>
              </label>
              {enableTP && (
                <input
                  type="number"
                  step="any"
                  value={tpPrice}
                  onChange={(e) => setTpPrice(Number(e.target.value))}
                  className={`w-28 p-1 text-right rounded border font-mono ${
                    isDark ? 'bg-[#1e222d] border-[#2a2e39] text-white' : 'bg-white border-gray-300 text-black'
                  }`}
                />
              )}
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 cursor-pointer text-[#f23645] font-bold">
                <input
                  type="checkbox"
                  checked={enableSL}
                  onChange={(e) => setEnableSL(e.target.checked)}
                  className="accent-[#f23645]"
                />
                <span>Stop Loss ($)</span>
              </label>
              {enableSL && (
                <input
                  type="number"
                  step="any"
                  value={slPrice}
                  onChange={(e) => setSlPrice(Number(e.target.value))}
                  className={`w-28 p-1 text-right rounded border font-mono ${
                    isDark ? 'bg-[#1e222d] border-[#2a2e39] text-white' : 'bg-white border-gray-300 text-black'
                  }`}
                />
              )}
            </div>

            {enableTP && enableSL && (
              <div className="flex justify-between text-[11px] pt-1 text-gray-400 font-mono border-t border-gray-500/20">
                <span>R:R Ratio: <b className="text-white">{rrRatio}</b></span>
                <span>Est Profit: <b className="text-[#089981]">+${potentialProfit.toFixed(2)}</b></span>
              </div>
            )}
          </div>

          {/* Margin Summary */}
          <div className="flex justify-between text-[11px] text-gray-400 font-mono">
            <span>Required Margin:</span>
            <span className="font-bold text-white">${marginRequired.toFixed(2)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-3 border-t flex justify-end gap-2 ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-gray-50'}`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 rounded text-xs font-semibold ${isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-gray-200'}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`px-5 py-1.5 rounded text-xs font-bold text-white transition-all shadow-md ${
              side === 'BUY' ? 'bg-[#089981] hover:bg-[#067a67]' : 'bg-[#f23645] hover:bg-[#d02534]'
            }`}
          >
            Place {side} Order (${marginRequired.toFixed(2)})
          </button>
        </div>
      </form>
    </div>
  );
};
