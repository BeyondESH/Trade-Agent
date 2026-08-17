import React, { useState } from 'react';
import { Camera, X, Copy, Download, Share2, Check } from 'lucide-react';
import { SymbolInfo } from '../../types/trading';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  symbol: SymbolInfo;
  theme: 'dark' | 'light';
}

export const SnapshotModal: React.FC<Props> = ({ isOpen, onClose, symbol, theme }) => {
  const [copied, setCopied] = useState(false);
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const shareUrl = `https://www.tradingview.com/chart/preview/?symbol=${symbol.ticker}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const canvas = document.getElementById('trading-canvas') as HTMLCanvasElement;
    if (canvas) {
      const link = document.createElement('a');
      link.download = `${symbol.ticker}-chart-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div
        id="snapshot-modal"
        className={`w-full max-w-md rounded-xl shadow-2xl border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
          isDark ? 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
        }`}
      >
        {/* Header */}
        <div className={`p-3 border-b flex items-center justify-between ${isDark ? 'border-[#2a2e39]' : 'border-[#e0e3eb]'}`}>
          <div className="flex items-center gap-2 font-bold text-sm">
            <Camera className="w-4 h-4 text-[#2962ff]" />
            <span>Chart Snapshot & Export</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-4 text-xs">
          <div className="flex flex-col gap-2">
            <div className="font-semibold text-gray-400">Shareable Chart Link</div>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className={`flex-1 p-2 rounded border font-mono text-[11px] outline-none ${
                  isDark ? 'bg-[#131722] border-[#2a2e39] text-white' : 'bg-white border-[#e0e3eb] text-black'
                }`}
              />
              <button
                onClick={handleCopy}
                className="px-3 py-2 rounded bg-[#2962ff] text-white font-semibold flex items-center gap-1.5 hover:bg-[#1e53e5] transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-500/20">
            <button
              onClick={handleDownload}
              className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 font-bold transition-colors ${
                isDark ? 'border-[#2a2e39] bg-[#131722] hover:bg-[#2a2e39]' : 'border-[#e0e3eb] bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <Download className="w-5 h-5 text-[#089981]" />
              <span>Save PNG Image</span>
            </button>

            <button
              onClick={handleCopy}
              className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 font-bold transition-colors ${
                isDark ? 'border-[#2a2e39] bg-[#131722] hover:bg-[#2a2e39]' : 'border-[#e0e3eb] bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <Share2 className="w-5 h-5 text-[#2962ff]" />
              <span>Copy Link</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
