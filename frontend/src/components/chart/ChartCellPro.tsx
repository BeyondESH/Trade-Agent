import { useEffect, useState } from 'react';
import type { Chart } from 'klinecharts';
import type { SymbolInfo as ProSymbolInfo, Period } from '@klinecharts/pro';
import { KLineChartProView } from './KLineChartProView';
import { useCellSync } from '../../lib/useCellSync';
import { chartCommands } from '../../lib/chartCommands';
import type { ThemeMode } from '../../types/trading';

interface Props {
  index: number;
  symbol: ProSymbolInfo;
  period: Period;
  datafeed: import('@klinecharts/pro').Datafeed;
  theme: ThemeMode;
  active: boolean;
  watermark?: string;
  chartType?: string;
}

export const ChartCellPro: React.FC<Props> = ({ index, symbol, period, datafeed, theme, active, watermark, chartType }) => {
  const [chart, setChart] = useState<Chart | null>(null);

  useCellSync({ index, chart, symbol, period, active });

  // The active cell owns the toolbar command target.
  useEffect(() => {
    if (!active) return;
    chartCommands.bind(chart);
    return () => chartCommands.bind(null);
  }, [active, chart]);

  // Chart type (candles/line/area/...) driven by the template TopNavbar.
  useEffect(() => {
    if (chart && chartType) chartCommands.setChartType(chartType);
  }, [chart, chartType]);

  return (
    <KLineChartProView
      symbol={symbol}
      period={period}
      datafeed={datafeed}
      theme={theme}
      drawingBarVisible={false}
      watermarkText={watermark}
      onReady={(c) => setChart(c)}
    />
  );
};
