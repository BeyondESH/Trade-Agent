import React, { useMemo, useState } from 'react';
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
import { ChartCellPro } from './ChartCellPro';
import { BitgetDatafeed, periodFromTimeframe } from '../../api/datafeed';
import type { Period, SymbolInfo as ProSymbolInfo } from '@klinecharts/pro';

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

/** Map a template symbol to the pro Datafeed symbol (instId in `id`). */
function toProSymbol(s: SymbolInfo): ProSymbolInfo {
  return {
    ticker: s.id || s.ticker,
    shortName: s.ticker,
    market: 'USDT-FUTURES',
  };
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

  // One shared datafeed instance: bitgetWs multiplexes by series key, so a
  // single feed safely serves every cell.
  const datafeed = useMemo(() => new BitgetDatafeed(), []);

  // Additional cell symbols for multi-chart layouts
  const secondarySymbol1 = symbols[1] || activeSymbol;
  const secondarySymbol2 = symbols[2] || activeSymbol;
  const secondarySymbol3 = symbols[3] || activeSymbol;

  const renderChartCell = (index: number, cellSymbol: SymbolInfo, cellTimeframe: Timeframe) => {
    const isSelected = activeCellIndex === index;
    const period: Period = periodFromTimeframe(cellTimeframe);

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
        <ChartCellPro
          index={index}
          symbol={toProSymbol(cellSymbol)}
          period={period}
          datafeed={datafeed}
          theme={theme}
          active={isSelected}
          watermark={cellSymbol.ticker}
          chartType={chartType}
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
