import React, { useState } from 'react';
import { Settings, X, Check, Palette, Sliders, Eye } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
}

export const ChartSettingsModal: React.FC<Props> = ({ isOpen, onClose, theme }) => {
  const [tab, setTab] = useState<'symbol' | 'status' | 'scales' | 'canvas' | 'trading'>('symbol');
  const [bullColor, setBullColor] = useState('#089981');
  const [bearColor, setBearColor] = useState('#f23645');
  const [showOHLC, setShowOHLC] = useState(true);
  const [showBarChange, setShowBarChange] = useState(true);
  const [showIndicatorValues, setShowIndicatorValues] = useState(true);
  const [showCountdown, setShowCountdown] = useState(true);
  const [gridLines, setGridLines] = useState(true);
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div
        id="chart-settings-modal"
        className={`w-full max-w-xl rounded-xl shadow-2xl border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
          isDark ? 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
        }`}
      >
        {/* Header */}
        <div className={`p-3 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
          <div className="flex items-center gap-2 font-bold text-sm">
            <Settings className="w-4 h-4 text-[#2962ff]" />
            <span>Chart Settings</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab strip */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Menu */}
          <div className={`w-36 border-r p-2 flex flex-col gap-1 text-xs font-medium ${
            isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-gray-50'
          }`}>
            {[
              { id: 'symbol', label: 'Symbol' },
              { id: 'status', label: 'Status Line' },
              { id: 'scales', label: 'Scales' },
              { id: 'canvas', label: 'Canvas' },
              { id: 'trading', label: 'Trading' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`w-full text-left px-3 py-2 rounded transition-colors ${
                  tab === t.id
                    ? 'bg-[#2962ff] text-white font-semibold'
                    : isDark
                    ? 'hover:bg-[#2a2e39] text-gray-300'
                    : 'hover:bg-gray-200 text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Right settings content */}
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 text-xs">
            {tab === 'symbol' && (
              <div className="flex flex-col gap-3">
                <div className="font-bold text-sm text-[#2962ff]">Candlestick Colors</div>
                <div className="flex items-center justify-between">
                  <span>Up Body (Bullish)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={bullColor}
                      onChange={(e) => setBullColor(e.target.value)}
                      className="w-7 h-7 rounded border border-gray-400/40 cursor-pointer"
                    />
                    <span className="font-mono">{bullColor}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span>Down Body (Bearish)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={bearColor}
                      onChange={(e) => setBearColor(e.target.value)}
                      className="w-7 h-7 rounded border border-gray-400/40 cursor-pointer"
                    />
                    <span className="font-mono">{bearColor}</span>
                  </div>
                </div>

                <div className="border-t border-gray-500/20 pt-3 flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showCountdown}
                      onChange={(e) => setShowCountdown(e.target.checked)}
                      className="accent-[#2962ff]"
                    />
                    <span>Show Countdown to Bar Close</span>
                  </label>
                </div>
              </div>
            )}

            {tab === 'status' && (
              <div className="flex flex-col gap-3">
                <div className="font-bold text-sm text-[#2962ff]">Status Line HUD</div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOHLC}
                    onChange={(e) => setShowOHLC(e.target.checked)}
                    className="accent-[#2962ff]"
                  />
                  <span>Show Open, High, Low, Close (OHLC) values</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showBarChange}
                    onChange={(e) => setShowBarChange(e.target.checked)}
                    className="accent-[#2962ff]"
                  />
                  <span>Show Bar Change % and price delta</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showIndicatorValues}
                    onChange={(e) => setShowIndicatorValues(e.target.checked)}
                    className="accent-[#2962ff]"
                  />
                  <span>Show Indicator Arguments & Titles</span>
                </label>
              </div>
            )}

            {tab === 'canvas' && (
              <div className="flex flex-col gap-3">
                <div className="font-bold text-sm text-[#2962ff]">Appearance & Background</div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gridLines}
                    onChange={(e) => setGridLines(e.target.checked)}
                    className="accent-[#2962ff]"
                  />
                  <span>Show Grid Lines (Vertical & Horizontal)</span>
                </label>
                <div className="text-gray-400 text-[11px] leading-relaxed">
                  Grid lines enhance alignment with precision price markers and timeframe increments.
                </div>
              </div>
            )}

            {tab === 'scales' && (
              <div className="flex flex-col gap-3">
                <div className="font-bold text-sm text-[#2962ff]">Scales & Price Placement</div>
                <div className="text-gray-400 text-xs">
                  Right Price Axis: Visible with real-time flashing tick badge and auto-zoom bounds.
                </div>
              </div>
            )}

            {tab === 'trading' && (
              <div className="flex flex-col gap-3">
                <div className="font-bold text-sm text-[#2962ff]">Trading & Orders on Chart</div>
                <div className="text-gray-400 text-xs">
                  Display open position lines, break-even markers, and drag-and-drop Stop Loss / Take Profit handles directly on the chart canvas.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`p-3 border-t flex justify-end gap-2 ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-gray-50'}`}>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-semibold bg-[#2962ff] text-white hover:bg-[#1e53e5] transition-colors"
          >
            Ok
          </button>
        </div>
      </div>
    </div>
  );
};
