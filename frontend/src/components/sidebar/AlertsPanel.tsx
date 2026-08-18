import React from 'react';
import { AlertItem, SymbolInfo } from '../../types/trading';
import { Bell, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { t } from '../../lib/i18n';

interface Props {
  alerts: AlertItem[];
  onRemoveAlert: (id: string) => void;
  onOpenCreateAlert: () => void;
  activeSymbol: SymbolInfo;
  theme: 'dark' | 'light';
}

export const AlertsPanel: React.FC<Props> = ({
  alerts,
  onRemoveAlert,
  onOpenCreateAlert,
  activeSymbol,
  theme,
}) => {
  const isDark = theme === 'dark';

  return (
    <div id="alerts-panel" className="flex flex-col h-full w-full select-none text-xs">
      <div className={`p-2.5 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <Bell className="w-4 h-4 text-[#ff9800]" />
          <span>{t('Alerts Log')}</span>
        </div>
        <button
          id="alerts-create-btn"
          onClick={onOpenCreateAlert}
          className="flex items-center gap-1 px-2 py-1 rounded bg-[#2962ff] text-white font-medium hover:bg-[#1e53e5] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('Create')}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 no-scrollbar">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500 gap-2 text-center p-4">
            <Bell className="w-8 h-8 opacity-30" />
            <p>{t('No active price alerts set')}</p>
            <button
              onClick={onOpenCreateAlert}
              className="text-[#2962ff] font-semibold hover:underline"
            >
              + {t('Create alert for').replace('%s', activeSymbol.ticker)}
            </button>
          </div>
        ) : (
          alerts.map((al) => (
            <div
              key={al.id}
              className={`p-2.5 rounded-lg border flex items-center justify-between ${
                isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-[#f8fafc] border-[#e0e3eb]'
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <span>{al.symbol}</span>
                  <span className="text-[10px] text-[#2962ff]">{al.condition}</span>
                  <span className="font-mono text-[11px]">${al.targetPrice}</span>
                </div>
                <div className="text-[10px] text-gray-400">
                  {al.note || 'Price alert notification'} · {al.frequency}
                </div>
              </div>
              <button
                onClick={() => onRemoveAlert(al.id)}
                className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                title={t('Delete Alert')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
