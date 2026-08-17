import React from 'react';
import { Drawing } from '../../types/trading';
import { Trash2, Copy, Lock, Unlock, Palette, Eye, EyeOff } from 'lucide-react';

interface Props {
  activeDrawing: Drawing;
  onUpdateDrawing: (drawing: Drawing) => void;
  onDeleteDrawing: (id: string) => void;
  onDuplicateDrawing: (drawing: Drawing) => void;
  theme: 'dark' | 'light';
}

const COLORS = [
  '#2962FF', // TradingView Blue
  '#089981', // Green
  '#F23645', // Red
  '#FF9800', // Orange
  '#E040FB', // Purple
  '#FFEB3B', // Yellow
  '#FFFFFF', // White
  '#787B86', // Gray
];

export const ActiveDrawingToolbar: React.FC<Props> = ({
  activeDrawing,
  onUpdateDrawing,
  onDeleteDrawing,
  onDuplicateDrawing,
  theme,
}) => {
  const [showColorPicker, setShowColorPicker] = React.useState(false);
  const isDark = theme === 'dark';

  return (
    <div
      id="active-drawing-toolbar"
      className={`absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-xl border backdrop-blur-md transition-all ${
        isDark
          ? 'bg-[#1e222d]/95 border-[#2a2e39] text-[#d1d4dc]'
          : 'bg-white/95 border-[#e0e3eb] text-[#131722]'
      }`}
    >
      <div className="flex items-center gap-1 pr-2 border-r border-gray-500/20 text-xs font-semibold uppercase tracking-wider text-[#2962ff]">
        {activeDrawing.type.replace('_', ' ')}
      </div>

      {/* Color Picker Toggle */}
      <div className="relative">
        <button
          id="drawing-color-btn"
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="p-1.5 rounded hover:bg-gray-500/20 flex items-center gap-1"
          title="Color"
        >
          <div
            className="w-4 h-4 rounded-full border border-gray-400/40"
            style={{ backgroundColor: activeDrawing.color }}
          />
        </button>

        {showColorPicker && (
          <div
            className={`absolute top-full mt-2 left-0 p-2 rounded-lg shadow-2xl border flex gap-1 z-40 ${
              isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
            }`}
          >
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onUpdateDrawing({ ...activeDrawing, color: c });
                  setShowColorPicker(false);
                }}
                className="w-5 h-5 rounded-full hover:scale-110 transition-transform border border-black/20"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Line Width */}
      <button
        id="drawing-width-btn"
        onClick={() => {
          const nextWidth = activeDrawing.lineWidth >= 4 ? 1 : activeDrawing.lineWidth + 1;
          onUpdateDrawing({ ...activeDrawing, lineWidth: nextWidth });
        }}
        className="px-2 py-1 text-xs font-medium rounded hover:bg-gray-500/20"
        title="Line Thickness"
      >
        {activeDrawing.lineWidth}px
      </button>

      {/* Line Style */}
      <button
        id="drawing-style-btn"
        onClick={() => {
          const nextStyle =
            activeDrawing.lineStyle === 'solid'
              ? 'dashed'
              : activeDrawing.lineStyle === 'dashed'
              ? 'dotted'
              : 'solid';
          onUpdateDrawing({ ...activeDrawing, lineStyle: nextStyle });
        }}
        className="px-2 py-1 text-xs font-medium rounded hover:bg-gray-500/20 capitalize"
        title="Line Style"
      >
        {activeDrawing.lineStyle || 'solid'}
      </button>

      {/* Lock / Unlock */}
      <button
        id="drawing-lock-btn"
        onClick={() => onUpdateDrawing({ ...activeDrawing, locked: !activeDrawing.locked })}
        className={`p-1.5 rounded hover:bg-gray-500/20 ${activeDrawing.locked ? 'text-[#ff9800]' : ''}`}
        title={activeDrawing.locked ? 'Unlock' : 'Lock'}
      >
        {activeDrawing.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
      </button>

      {/* Duplicate */}
      <button
        id="drawing-duplicate-btn"
        onClick={() => onDuplicateDrawing(activeDrawing)}
        className="p-1.5 rounded hover:bg-gray-500/20"
        title="Clone Drawing"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>

      {/* Delete */}
      <button
        id="drawing-delete-btn"
        onClick={() => onDeleteDrawing(activeDrawing.id)}
        className="p-1.5 rounded hover:bg-red-500/20 text-red-500 hover:text-red-400"
        title="Delete"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
