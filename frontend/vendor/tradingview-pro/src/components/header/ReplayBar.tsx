import React from 'react';
import { Play, Pause, SkipForward, RotateCcw, X, FastForward } from 'lucide-react';

interface Props {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onReset: () => void;
  speed: number;
  onChangeSpeed: (speed: number) => void;
  onClose: () => void;
  theme: 'dark' | 'light';
}

export const ReplayBar: React.FC<Props> = ({
  isPlaying,
  onTogglePlay,
  onStepForward,
  onReset,
  speed,
  onChangeSpeed,
  onClose,
  theme,
}) => {
  const isDark = theme === 'dark';

  return (
    <div
      id="replay-control-bar"
      className={`h-9 px-3 flex items-center justify-between border-b text-xs select-none transition-colors ${
        isDark ? 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]' : 'bg-[#f0f3fa] border-[#e0e3eb] text-[#131722]'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-semibold text-[#2962ff]">
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Bar Replay Mode</span>
        </div>

        <div className="h-4 w-[1px] bg-gray-500/20" />

        {/* Play/Pause */}
        <button
          id="replay-play-toggle-btn"
          onClick={onTogglePlay}
          className={`flex items-center gap-1 px-2.5 py-1 rounded font-medium transition-colors ${
            isPlaying ? 'bg-[#2962ff] text-white' : isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-white'
          }`}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isPlaying ? 'Pause' : 'Play'}</span>
        </button>

        {/* Step Forward 1 Bar */}
        <button
          id="replay-step-btn"
          onClick={onStepForward}
          className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-500/20 transition-colors`}
          title="Forward 1 Bar"
        >
          <SkipForward className="w-3.5 h-3.5" />
          <span>Step</span>
        </button>

        {/* Speed Selector */}
        <div className="flex items-center gap-1 ml-2 text-[11px]">
          <span className="text-gray-500">Speed:</span>
          {[0.2, 0.5, 1, 2].map((s) => (
            <button
              key={s}
              onClick={() => onChangeSpeed(s)}
              className={`px-1.5 py-0.5 rounded font-mono ${
                speed === s
                  ? 'bg-[#2962ff] text-white'
                  : isDark
                  ? 'hover:bg-[#2a2e39] text-gray-400'
                  : 'hover:bg-white text-gray-600'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Reset */}
        <button
          id="replay-reset-btn"
          onClick={onReset}
          className="px-2 py-1 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white"
        >
          Reset to Start
        </button>
      </div>

      <button
        id="replay-close-btn"
        onClick={onClose}
        className="p-1 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white"
        title="Exit Replay"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
