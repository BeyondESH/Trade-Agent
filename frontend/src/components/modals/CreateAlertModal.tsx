import React, { useState } from 'react';
import { SymbolInfo, AlertItem } from '../../types/trading';
import { Bell, X, Check } from 'lucide-react';
import { t } from '../../lib/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  symbol: SymbolInfo;
  onAddAlert: (alert: AlertItem) => void;
  theme: 'dark' | 'light';
  /** Prefill the target price (e.g. from the chart right-click menu). */
  initialPrice?: number;
}

export const CreateAlertModal: React.FC<Props> = ({
  isOpen,
  onClose,
  symbol,
  onAddAlert,
  theme,
  initialPrice,
}) => {
  const [condition, setCondition] = useState<'Crossing' | 'Crossing Up' | 'Crossing Down' | 'Greater Than' | 'Less Than'>('Crossing');
  const [targetPrice, setTargetPrice] = useState<number>(initialPrice ?? Number(symbol.price.toFixed(symbol.digits)));
  const [frequency, setFrequency] = useState<'Only Once' | 'Every Time'>('Only Once');
  const [note, setNote] = useState('');
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddAlert({
      id: `alt-${Date.now()}`,
      symbol: symbol.ticker,
      condition,
      targetPrice,
      createdAt: 'Just now',
      triggered: false,
      note: note || `${symbol.ticker} ${condition} $${targetPrice}`,
      frequency,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <form
        onSubmit={handleSubmit}
        id="create-alert-modal"
        className={`w-full max-w-md rounded-xl shadow-2xl border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
          isDark ? 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
        }`}
      >
        {/* Header */}
        <div className={`p-3 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
          <div className="flex items-center gap-2 font-bold text-sm">
            <Bell className="w-4 h-4 text-[#ff9800]" />
            <span>Create Alert on {symbol.ticker}</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 flex flex-col gap-3 text-xs">
          <div>
            <label className="text-gray-400 font-semibold mb-1 block">{t('Condition')}</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as any)}
              className={`w-full p-2 rounded border outline-none ${
                isDark ? 'bg-[#131722] border-[#2a2e39] text-white' : 'bg-white border-[#e0e3eb] text-black'
              }`}
            >
              <option value="Crossing">{t('Crossing Price')}</option>
              <option value="Crossing Up">{t('Crossing Up')}</option>
              <option value="Crossing Down">{t('Crossing Down')}</option>
              <option value="Greater Than">{t('Greater Than')}</option>
              <option value="Less Than">{t('Less Than')}</option>
            </select>
          </div>

          <div>
            <label className="text-gray-400 font-semibold mb-1 block">{t('Target Price ($)')}</label>
            <input
              type="number"
              step="any"
              value={targetPrice}
              onChange={(e) => setTargetPrice(Number(e.target.value))}
              required
              className={`w-full p-2 rounded border outline-none font-mono font-bold ${
                isDark ? 'bg-[#131722] border-[#2a2e39] text-white' : 'bg-white border-[#e0e3eb] text-black'
              }`}
            />
          </div>

          <div>
            <label className="text-gray-400 font-semibold mb-1 block">{t('Trigger Frequency')}</label>
            <div className="flex gap-2">
              {(['Only Once', 'Every Time'] as const).map((f) => (
                <button
                  type="button"
                  key={f}
                  onClick={() => setFrequency(f)}
                  className={`flex-1 py-1.5 rounded border text-xs font-semibold transition-colors ${
                    frequency === f
                      ? 'bg-[#2962ff] text-white border-[#2962ff]'
                      : isDark
                      ? 'border-[#2a2e39] hover:bg-[#2a2e39]'
                      : 'border-[#e0e3eb] hover:bg-gray-100'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-gray-400 font-semibold mb-1 block">{t('Alert Message / Note')}</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. BTC breakout confirmation at key resistance"
              className={`w-full p-2 rounded border outline-none ${
                isDark ? 'bg-[#131722] border-[#2a2e39] text-white' : 'bg-white border-[#e0e3eb] text-black'
              }`}
            />
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
            className="px-4 py-1.5 rounded text-xs font-semibold bg-[#2962ff] text-white hover:bg-[#1e53e5] transition-colors"
          >
            Create Alert
          </button>
        </div>
      </form>
    </div>
  );
};
