import React, { useState } from 'react';
import {
  SymbolInfo,
  Timeframe,
  ChartType,
  DrawingToolType,
  Drawing,
  IndicatorConfig,
  Candle,
  ThemeMode,
} from '../../types/trading';
import { TradingChart } from './TradingChart';

interface Props {
  activeSymbol: SymbolInfo;
  symbols: SymbolInfo[];
  timeframe: Timeframe;
  chartType: ChartType;
  candles: Candle[];
  activeTool: DrawingToolType;
  onToolUsed: () => void;
  indicators: IndicatorConfig[];
  onToggleIndicator: (id: string) => void;
  onRemoveIndicator: (id: string) => void;
  drawings: Drawing[];
  onUpdateDrawings: (drawings: Drawing[]) => void;
  magnetMode: boolean;
  lockAll: boolean;
  hideAll: boolean;
  theme: ThemeMode;
  layout: string; // '1x1', '2x1', '1x2', '2x2'
  isReplayActive: boolean;
  replayIndex: number;
  onOpenOrderModal: (side: 'BUY' | 'SELL') => void;
  onOpenSymbolSearch: () => void;
  onSelectSymbol: (symbol: SymbolInfo) => void;
}

export const MultiChartGrid: React.FC<Props> = ({
  activeSymbol,
  symbols,
  timeframe,
  chartType,
  candles,
  activeTool,
  onToolUsed,
  indicators,
  onToggleIndicator,
  onRemoveIndicator,
  drawings,
  onUpdateDrawings,
  magnetMode,
  lockAll,
  hideAll,
  theme,
  layout,
  isReplayActive,
  replayIndex,
  onOpenOrderModal,
  onOpenSymbolSearch,
  onSelectSymbol,
}) => {
  const [activeCellIndex, setActiveCellIndex] = useState(0);

  // Additional cell symbols for multi-chart layouts
  const secondarySymbol1 = symbols[1] || activeSymbol;
  const secondarySymbol2 = symbols[2] || activeSymbol;
  const secondarySymbol3 = symbols[3] || activeSymbol;

  const renderChartCell = (index: number, cellSymbol: SymbolInfo, cellTimeframe: Timeframe) => {
    const isSelected = activeCellIndex === index;

    return (
      <div
        key={index}
        onClick={() => {
          setActiveCellIndex(index);
          onSelectSymbol(cellSymbol);
        }}
        className={`relative flex-1 h-full w-full overflow-hidden transition-all duration-150 ${
          layout !== '1x1' && isSelected ? 'ring-2 ring-[#2962ff] z-10' : ''
        }`}
      >
        <TradingChart
          symbol={cellSymbol}
          timeframe={cellTimeframe}
          chartType={chartType}
          candles={candles}
          activeTool={activeTool}
          onToolUsed={onToolUsed}
          indicators={indicators}
          onToggleIndicator={onToggleIndicator}
          onRemoveIndicator={onRemoveIndicator}
          drawings={drawings}
          onUpdateDrawings={onUpdateDrawings}
          magnetMode={magnetMode}
          lockAll={lockAll}
          hideAll={hideAll}
          theme={theme}
          isReplayActive={isReplayActive}
          replayIndex={replayIndex}
          onOpenOrderModal={onOpenOrderModal}
          onOpenSymbolSearch={onOpenSymbolSearch}
        />
      </div>
    );
  };

  if (layout === '2x1') {
    return (
      <div className="flex-1 w-full h-full grid grid-cols-2 gap-1 overflow-hidden bg-black/40">
        {renderChartCell(0, activeSymbol, timeframe)}
        {renderChartCell(1, secondarySymbol1, '4h')}
      </div>
    );
  }

  if (layout === '1x2') {
    return (
      <div className="flex-1 w-full h-full grid grid-rows-2 gap-1 overflow-hidden bg-black/40">
        {renderChartCell(0, activeSymbol, timeframe)}
        {renderChartCell(1, secondarySymbol1, '1D')}
      </div>
    );
  }

  if (layout === '2x2') {
    return (
      <div className="flex-1 w-full h-full grid grid-cols-2 grid-rows-2 gap-1 overflow-hidden bg-black/40">
        {renderChartCell(0, activeSymbol, timeframe)}
        {renderChartCell(1, secondarySymbol1, '15m')}
        {renderChartCell(2, secondarySymbol2, '4h')}
        {renderChartCell(3, secondarySymbol3, '1D')}
      </div>
    );
  }

  // Default 1x1 single chart
  return (
    <div className="flex-1 w-full h-full overflow-hidden">
      {renderChartCell(0, activeSymbol, timeframe)}
    </div>
  );
};
