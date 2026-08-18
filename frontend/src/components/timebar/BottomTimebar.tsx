import React from 'react';
import { Calendar as CalIcon, Clock, Globe } from 'lucide-react';
import { t } from '../../lib/i18n';

interface Props {
  onSelectRange: (range: string) => void;
  selectedRange: string;
  isLogScale: boolean;
  onToggleLogScale: () => void;
  isPercentScale: boolean;
  onTogglePercentScale: () => void;
  isAutoScale: boolean;
  onToggleAutoScale: () => void;
  theme: 'dark' | 'light';
}

const RANGES = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL'];

export const BottomTimebar: React.FC<Props> = ({
  onSelectRange,
  selectedRange,
  isLogScale,
  onToggleLogScale,
  isPercentScale,
  onTogglePercentScale,
  isAutoScale,
  onToggleAutoScale,
  theme,
}) => {
  const isDark = theme === 'dark';

  return (
    <div
      id="bottom-timebar"
      className={`h-[28px] flex-none px-3 flex items-center justify-between border-t text-[11px] select-none ${
        isDark ? 'bg-[#131722] border-[#2a2e39] text-[#787b86]' : 'bg-white border-[#e0e3eb] text-[#787b86]'
      }`}
    >
      {/* Left Time Ranges */}
      <div className="flex items-center gap-1">
        {RANGES.map((r) => (
          <button
            key={r}
            id={`range-btn-${r}`}
            onClick={() => onSelectRange(r)}
            className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
              selectedRange === r
                ? 'bg-[#2962ff] text-white font-bold'
                : isDark
                ? 'hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
                : 'hover:bg-[#f0f3fa] hover:text-[#131722]'
            }`}
          >
            {r}
          </button>
        ))}

        <div className="h-3 w-[1px] bg-gray-500/20 mx-1" />

        <button
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-gray-500/20`}
          title="Go to specific date"
        >
          <CalIcon className="w-3 h-3" />
        </button>
      </div>

      {/* Right Timezone & Scales */}
      <div className="flex items-center gap-2 font-mono">
        <div className="flex items-center gap-1 text-gray-500 text-[10px]">
          <Globe className="w-3 h-3" />
          <span>UTC+0 (实时)</span>
        </div>

        <div className="h-3 w-[1px] bg-gray-500/20" />

        <button
          id="toggle-percent-btn"
          onClick={onTogglePercentScale}
          className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
            isPercentScale
              ? 'bg-[#2962ff] text-white'
              : isDark
              ? 'hover:bg-[#2a2e39]'
              : 'hover:bg-[#f0f3fa]'
          }`}
          title="百分比坐标"
        >
          %
        </button>

        <button
          id="toggle-log-btn"
          onClick={onToggleLogScale}
          className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
            isLogScale
              ? 'bg-[#2962ff] text-white'
              : isDark
              ? 'hover:bg-[#2a2e39]'
              : 'hover:bg-[#f0f3fa]'
          }`}
          title="对数坐标"
        >
          log
        </button>

        <button
          id="toggle-auto-btn"
          onClick={onToggleAutoScale}
          className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
            isAutoScale
              ? 'bg-[#2962ff] text-white'
              : isDark
              ? 'hover:bg-[#2a2e39]'
              : 'hover:bg-[#f0f3fa]'
          }`}
          title="自动坐标"
        >
          auto
        </button>
      </div>
    </div>
  );
};
