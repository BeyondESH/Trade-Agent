import React, { useState } from 'react';
import {
  DrawingToolType,
} from '../../types/trading';
import {
  Crosshair,
  TrendingUp,
  GitCommit,
  Square,
  Type,
  TrendingDown,
  Ruler,
  Magnet,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Trash2,
  Brush,
  ChevronRight,
  Circle,
  Highlighter,
  Minus,
  Maximize2,
} from 'lucide-react';

interface Props {
  activeTool: DrawingToolType;
  onSelectTool: (tool: DrawingToolType) => void;
  magnetMode: boolean;
  onToggleMagnet: () => void;
  lockAll: boolean;
  onToggleLockAll: () => void;
  hideAll: boolean;
  onToggleHideAll: () => void;
  onClearDrawings: () => void;
  theme: 'dark' | 'light';
}

export const DrawingToolbar: React.FC<Props> = ({
  activeTool,
  onSelectTool,
  magnetMode,
  onToggleMagnet,
  lockAll,
  onToggleLockAll,
  hideAll,
  onToggleHideAll,
  onClearDrawings,
  theme,
}) => {
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const isDark = theme === 'dark';

  const toolGroups = [
    {
      id: 'cursor',
      icon: Crosshair,
      title: 'Cursor Tools',
      items: [
        { type: 'crosshair' as DrawingToolType, label: 'Crosshair', icon: Crosshair },
        { type: 'dot' as DrawingToolType, label: 'Dot', icon: Circle },
        { type: 'cursor' as DrawingToolType, label: 'Arrow', icon: Crosshair },
        { type: 'eraser' as DrawingToolType, label: 'Eraser', icon: Trash2 },
      ],
    },
    {
      id: 'lines',
      icon: TrendingUp,
      title: 'Trend Line Tools',
      items: [
        { type: 'trendline' as DrawingToolType, label: 'Trend Line', icon: TrendingUp },
        { type: 'ray' as DrawingToolType, label: 'Ray', icon: TrendingUp },
        { type: 'info_line' as DrawingToolType, label: 'Info Line', icon: TrendingUp },
        { type: 'horizontal_line' as DrawingToolType, label: 'Horizontal Line', icon: Minus },
        { type: 'horizontal_ray' as DrawingToolType, label: 'Horizontal Ray', icon: Minus },
        { type: 'vertical_line' as DrawingToolType, label: 'Vertical Line', icon: Minus },
        { type: 'parallel_channel' as DrawingToolType, label: 'Parallel Channel', icon: TrendingUp },
      ],
    },
    {
      id: 'fib',
      icon: GitCommit,
      title: 'Gann and Fibonacci Tools',
      items: [
        { type: 'fib_retracement' as DrawingToolType, label: 'Fib Retracement', icon: GitCommit },
        { type: 'fib_extension' as DrawingToolType, label: 'Trend-Based Fib Extension', icon: GitCommit },
        { type: 'pitchfork' as DrawingToolType, label: 'Pitchfork', icon: GitCommit },
      ],
    },
    {
      id: 'shapes',
      icon: Square,
      title: 'Geometric Shapes',
      items: [
        { type: 'brush' as DrawingToolType, label: 'Brush', icon: Brush },
        { type: 'highlighter' as DrawingToolType, label: 'Highlighter', icon: Highlighter },
        { type: 'rectangle' as DrawingToolType, label: 'Rectangle', icon: Square },
        { type: 'circle' as DrawingToolType, label: 'Circle', icon: Circle },
      ],
    },
    {
      id: 'text',
      icon: Type,
      title: 'Annotation Tools',
      items: [
        { type: 'text' as DrawingToolType, label: 'Text', icon: Type },
        { type: 'callout' as DrawingToolType, label: 'Callout', icon: Type },
        { type: 'price_label' as DrawingToolType, label: 'Price Label', icon: Type },
      ],
    },
    {
      id: 'prediction',
      icon: TrendingDown,
      title: 'Prediction and Measurement',
      items: [
        { type: 'long_position' as DrawingToolType, label: 'Long Position', icon: TrendingUp },
        { type: 'short_position' as DrawingToolType, label: 'Short Position', icon: TrendingDown },
        { type: 'price_range' as DrawingToolType, label: 'Price Range', icon: Ruler },
        { type: 'date_range' as DrawingToolType, label: 'Date Range', icon: Ruler },
      ],
    },
  ];

  return (
    <div
      id="left-drawing-toolbar"
      className={`w-[46px] flex-none flex flex-col items-center py-2 border-r z-20 select-none ${
        isDark ? 'bg-[#131722] border-[#2a2e39] text-[#787b86]' : 'bg-white border-[#e0e3eb] text-[#787b86]'
      }`}
    >
      {/* Tool Groups */}
      <div className="flex flex-col items-center gap-1 w-full flex-1">
        {toolGroups.map((group) => {
          const isActive = group.items.some((it) => it.type === activeTool);
          const activeItem = group.items.find((it) => it.type === activeTool) || group.items[0];
          const Icon = activeItem.icon;

          return (
            <div key={group.id} className="relative w-full flex justify-center">
              <div
                className={`group relative flex items-center justify-center w-8 h-8 rounded cursor-pointer transition-colors ${
                  isActive
                    ? isDark
                      ? 'bg-[#2962ff] text-white shadow-xs'
                      : 'bg-[#2962ff] text-white shadow-xs'
                    : isDark
                    ? 'hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
                    : 'hover:bg-[#f0f3fa] hover:text-[#131722]'
                }`}
                onClick={() => onSelectTool(activeItem.type)}
                onMouseEnter={() => setOpenSubmenu(group.id)}
                onMouseLeave={() => setOpenSubmenu(null)}
              >
                <Icon className="w-4 h-4" />

                {/* Submenu Indicator Arrow */}
                <span className="absolute bottom-0.5 right-0.5 w-1 h-1 border-r border-b border-current opacity-70" />

                {/* Flyout Submenu */}
                {openSubmenu === group.id && (
                  <div
                    className={`absolute left-full top-0 ml-1 py-1.5 px-1 rounded-lg shadow-xl border z-50 min-w-[180px] backdrop-blur-md ${
                      isDark ? 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]' : 'bg-white border-[#e0e3eb] text-[#131722]'
                    }`}
                  >
                    <div className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase text-gray-500">
                      {group.title}
                    </div>
                    {group.items.map((item) => {
                      const SubIcon = item.icon;
                      return (
                        <button
                          key={item.type}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTool(item.type);
                            setOpenSubmenu(null);
                          }}
                          className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-xs text-left transition-colors ${
                            activeTool === item.type
                              ? 'bg-[#2962ff] text-white'
                              : isDark
                              ? 'hover:bg-[#2a2e39]'
                              : 'hover:bg-[#f0f3fa]'
                          }`}
                        >
                          <SubIcon className="w-3.5 h-3.5" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Measure Tool */}
        <button
          id="drawing-measure-tool-btn"
          onClick={() => onSelectTool(activeTool === 'measure' ? 'crosshair' : 'measure')}
          className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
            activeTool === 'measure'
              ? 'bg-[#2962ff] text-white'
              : isDark
              ? 'hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
              : 'hover:bg-[#f0f3fa] hover:text-[#131722]'
          }`}
          title="Measure (Shift + Click)"
        >
          <Ruler className="w-4 h-4" />
        </button>

        {/* Divider */}
        <div className="w-5 h-[1px] bg-gray-500/20 my-1.5" />

        {/* Magnet Tool */}
        <button
          id="drawing-magnet-btn"
          onClick={onToggleMagnet}
          className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
            magnetMode
              ? 'bg-[#2962ff] text-white'
              : isDark
              ? 'hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
              : 'hover:bg-[#f0f3fa] hover:text-[#131722]'
          }`}
          title="Magnet Mode (Snap to OHLC)"
        >
          <Magnet className="w-4 h-4" />
        </button>

        {/* Lock All Drawings */}
        <button
          id="drawing-lock-all-btn"
          onClick={onToggleLockAll}
          className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
            lockAll
              ? 'bg-[#ff9800] text-white'
              : isDark
              ? 'hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
              : 'hover:bg-[#f0f3fa] hover:text-[#131722]'
          }`}
          title="Lock All Drawing Tools"
        >
          {lockAll ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
        </button>

        {/* Hide All Drawings */}
        <button
          id="drawing-hide-all-btn"
          onClick={onToggleHideAll}
          className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
            hideAll
              ? 'bg-[#f23645] text-white'
              : isDark
              ? 'hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
              : 'hover:bg-[#f0f3fa] hover:text-[#131722]'
          }`}
          title="Hide All Drawings"
        >
          {hideAll ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>

        {/* Clear Drawings */}
        <button
          id="drawing-clear-all-btn"
          onClick={onClearDrawings}
          className={`flex items-center justify-center w-8 h-8 rounded transition-colors text-red-500/80 hover:text-red-500 ${
            isDark ? 'hover:bg-[#2a2e39]' : 'hover:bg-[#f0f3fa]'
          }`}
          title="Remove Objects / Drawings"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
