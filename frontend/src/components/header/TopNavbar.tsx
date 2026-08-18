import React from 'react';
import { SymbolInfo, ThemeMode } from '../../types/trading';
import { Bell, Sun, Moon, TrendingUp, TrendingDown } from 'lucide-react';
import { t } from '../../lib/i18n';

interface Props {
  symbol: SymbolInfo;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenAlertModal: () => void;
  onOpenOrderModal: (side: 'BUY' | 'SELL') => void;
}

/**
 * Minimal top bar over the native klinecharts-pro chart. Chart controls
 * (period / chart type / indicators / drawing tools / settings) live in the
 * native klinecharts-pro chrome; this bar only surfaces the active symbol
 * quote plus alert / order / theme shortcuts.
 */
export const TopNavbar: React.FC<Props> = ({
  symbol,
  theme,
  onToggleTheme,
  onOpenAlertModal,
  onOpenOrderModal,
}) => {
  const isDark = theme === 'dark';
  const up = symbol.change24hPercent >= 0;

  return (
    <header
      id="tradingview-top-header"
      className={`h-[44px] flex-none px-2 flex items-center justify-between border-b text-xs select-none transition-colors z-30 ${
        isDark ? 'bg-[#131722] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
      }`}
    >
      {/* Left: symbol quote strip */}
      <div className="flex items-center gap-2 h-full overflow-x-auto no-scrollbar">
        <span className="text-sm font-bold tracking-tight text-[#2962ff]">{symbol.ticker}</span>
        <span className="text-[10px] text-gray-500 font-semibold uppercase">{symbol.exchange}</span>
        <span
          className={`flex items-center gap-1 text-xs font-mono font-semibold ${
            up ? 'text-[#089981]' : 'text-[#f23645]'
          }`}
        >
          {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {up ? '+' : ''}
          {symbol.change24hPercent.toFixed(2)}%
        </span>
        <span className="text-xs font-mono font-bold">
          {symbol.price.toLocaleString(undefined, {
            minimumFractionDigits: symbol.digits,
            maximumFractionDigits: symbol.digits,
          })}
        </span>
        <span className="text-[10px] text-gray-500">{symbol.name}</span>
      </div>

      {/* Right: alert / order / theme shortcuts */}
      <div className="flex items-center gap-1.5 flex-none pl-2">
        <button
          id="top-alert-btn"
          onClick={onOpenAlertModal}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-colors ${
            isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-[#f0f3fa]'
          }`}
          title={t('Create Alert (Alt+A)')}
        >
          <Bell className="w-3.5 h-3.5 text-[#ff9800]" />
          <span>{t('Alert')}</span>
        </button>

        <button
          id="top-buy-btn"
          onClick={() => onOpenOrderModal('BUY')}
          className="px-2.5 py-1 rounded bg-[#089981] text-white font-semibold hover:bg-[#067a67] transition-colors"
        >
          {t('Buy / Long')}
        </button>
        <button
          id="top-sell-btn"
          onClick={() => onOpenOrderModal('SELL')}
          className="px-2.5 py-1 rounded bg-[#f23645] text-white font-semibold hover:bg-[#d02534] transition-colors"
        >
          {t('Sell / Short')}
        </button>

        <div className="h-4 w-[1px] bg-gray-500/20" />

        <button
          id="theme-toggle-btn"
          onClick={onToggleTheme}
          className={`p-1.5 rounded transition-colors ${isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-[#f0f3fa]'}`}
          title={isDark ? t('Switch to Light Mode') : t('Switch to Dark Mode')}
        >
          {isDark ? <Sun className="w-4 h-4 text-[#ff9800]" /> : <Moon className="w-4 h-4 text-gray-600" />}
        </button>
      </div>
    </header>
  );
};
