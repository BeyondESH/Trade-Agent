import React from 'react';
import { Keyboard, X } from 'lucide-react';
import { ThemeMode } from '../../types/trading';
import { t } from '../../lib/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
}

export const KeyboardShortcutsModal: React.FC<Props> = ({ isOpen, onClose, theme }) => {
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const categories = [
    {
      title: 'Navigation & Workspaces',
      shortcuts: [
        { key: '⌘ + K', desc: 'Open Global Command Palette' },
        { key: '⌘ + T', desc: 'New Workspace Tab' },
        { key: '⌘ + W', desc: 'Close Active Tab' },
        { key: 'Space', desc: 'Cycle to Next Symbol in Watchlist' },
        { key: 'Shift + Space', desc: 'Cycle to Previous Symbol' },
      ],
    },
    {
      title: 'Charting & Drawing Tools',
      shortcuts: [
        { key: 'Alt + T', desc: 'Select Trend Line Tool' },
        { key: 'Alt + H', desc: 'Horizontal Line Tool' },
        { key: 'Alt + F', desc: 'Fibonacci Retracement' },
        { key: 'Alt + C', desc: 'Crosshair Mode' },
        { key: '/', desc: 'Open Technical Indicators Library' },
        { key: 'Alt + A', desc: 'Create Price Alert' },
      ],
    },
    {
      title: 'Chart Navigation',
      shortcuts: [
        { key: 'Scroll Wheel', desc: 'Zoom In / Out Time Axis' },
        { key: 'Click + Drag', desc: 'Pan Chart Canvas' },
        { key: 'Double Click', desc: 'Auto-fit & Reset Chart Scale' },
        { key: 'Shift + Drag', desc: 'Measure Price & Bars Box' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div
        id="keyboard-shortcuts-modal"
        className={`w-full max-w-2xl rounded-xl shadow-2xl border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${
          isDark ? 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
        }`}
      >
        {/* Header */}
        <div className={`p-3 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
          <div className="flex items-center gap-2 font-bold text-sm">
            <Keyboard className="w-4 h-4 text-[#2962ff]" />
            <span>{t('TradingView Desktop Keyboard Shortcuts')}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-500/20 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[460px] overflow-y-auto">
          {categories.map((cat, i) => (
            <div key={i} className={`p-3 rounded-lg border flex flex-col gap-2 ${
              isDark ? 'bg-[#131722]/60 border-[#2a2e39]' : 'bg-gray-50 border-[#e0e3eb]'
            }`}>
              <div className="font-bold text-xs text-[#2962ff] uppercase tracking-wider">
                {cat.title}
              </div>
              <div className="flex flex-col gap-1.5 text-xs">
                {cat.shortcuts.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2">
                    <span className="text-gray-300">{s.desc}</span>
                    <kbd className="px-2 py-0.5 rounded bg-gray-500/20 font-mono text-[11px] font-bold text-white whitespace-nowrap">
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className={`p-3 border-t flex justify-end ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-gray-50'}`}>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-semibold bg-[#2962ff] text-white hover:bg-[#1e53e5]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
