import React, { useState } from 'react';
import { Settings, X, Monitor, Cpu, Volume2, Shield, Bell, Cloud } from 'lucide-react';
import { ThemeMode } from '../../types/trading';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const DesktopSettingsModal: React.FC<Props> = ({ isOpen, onClose, theme, onToggleTheme }) => {
  const [hardwareAccel, setHardwareAccel] = useState(true);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [crosshairSync, setCrosshairSync] = useState(true);
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div
        id="desktop-settings-modal"
        className={`w-full max-w-xl rounded-xl shadow-2xl border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${
          isDark ? 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
        }`}
      >
        {/* Header */}
        <div className={`p-3 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
          <div className="flex items-center gap-2 font-bold text-sm">
            <Settings className="w-4 h-4 text-[#2962ff]" />
            <span>TradingView Desktop App Settings</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-500/20 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-4 text-xs max-h-[460px] overflow-y-auto">
          {/* Section: Appearance */}
          <div className={`p-3 rounded-lg border flex flex-col gap-3 ${isDark ? 'bg-[#131722]/60 border-[#2a2e39]' : 'bg-gray-50 border-[#e0e3eb]'}`}>
            <div className="font-bold text-xs text-[#2962ff] uppercase tracking-wider flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5" />
              <span>Display & Theme</span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Color Theme</div>
                <div className="text-gray-400 text-[11px]">Choose between Elegant Dark and Clean Light</div>
              </div>
              <button
                onClick={onToggleTheme}
                className="px-3 py-1 rounded bg-[#2962ff] text-white font-semibold"
              >
                {theme === 'dark' ? 'Dark Theme' : 'Light Theme'}
              </button>
            </div>
          </div>

          {/* Section: Performance & Engine */}
          <div className={`p-3 rounded-lg border flex flex-col gap-3 ${isDark ? 'bg-[#131722]/60 border-[#2a2e39]' : 'bg-gray-50 border-[#e0e3eb]'}`}>
            <div className="font-bold text-xs text-[#2962ff] uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              <span>Engine & Hardware</span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Hardware GPU Acceleration</div>
                <div className="text-gray-400 text-[11px]">Enables 120 FPS high-refresh canvas rendering</div>
              </div>
              <input
                type="checkbox"
                checked={hardwareAccel}
                onChange={(e) => setHardwareAccel(e.target.checked)}
                className="accent-[#2962ff] w-4 h-4 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Crosshair Synchronization</div>
                <div className="text-gray-400 text-[11px]">Sync cursor position across multi-chart grids</div>
              </div>
              <input
                type="checkbox"
                checked={crosshairSync}
                onChange={(e) => setCrosshairSync(e.target.checked)}
                className="accent-[#2962ff] w-4 h-4 cursor-pointer"
              />
            </div>
          </div>

          {/* Section: Cloud & Sync */}
          <div className={`p-3 rounded-lg border flex flex-col gap-3 ${isDark ? 'bg-[#131722]/60 border-[#2a2e39]' : 'bg-gray-50 border-[#e0e3eb]'}`}>
            <div className="font-bold text-xs text-[#2962ff] uppercase tracking-wider flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5" />
              <span>Cloud & Storage</span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Instant Cloud Sync</div>
                <div className="text-gray-400 text-[11px]">Autosave drawing annotations and templates to TradingView account</div>
              </div>
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="accent-[#2962ff] w-4 h-4 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Audio Alerts & Execution Chimes</div>
                <div className="text-gray-400 text-[11px]">Play audio tones on order fills and price breaches</div>
              </div>
              <input
                type="checkbox"
                checked={soundAlerts}
                onChange={(e) => setSoundAlerts(e.target.checked)}
                className="accent-[#2962ff] w-4 h-4 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-3 border-t flex justify-end ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-[#e0e3eb] bg-gray-50'}`}>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-semibold bg-[#2962ff] text-white hover:bg-[#1e53e5]"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};
