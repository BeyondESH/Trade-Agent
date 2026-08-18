import { useMemo } from 'react';
import type { Period, SymbolInfo as ProSymbolInfo } from '@klinecharts/pro';
import type { SymbolInfo, ThemeMode } from '../../types/trading';
import { BitgetDatafeed, periodFromTimeframe } from '../../api/datafeed';
import { KLineChartProView, type KLineChartProHandle } from './KLineChartProView';
import type { Chart } from 'klinecharts';

interface Props {
  symbol: SymbolInfo;
  timeframe: string;
  theme: ThemeMode;
  onSymbolChange?: (s: ProSymbolInfo) => void;
  onPeriodChange?: (p: Period) => void;
  onChartReady?: (c: Chart | null) => void;
}

/** Convert the shell SymbolInfo to the pro Datafeed SymbolInfo. */
function toProSymbol(s: SymbolInfo): ProSymbolInfo {
  return {
    ticker: s.id || s.ticker,
    shortName: s.ticker,
    name: s.name,
    exchange: s.exchange,
    market: 'USDT-FUTURES',
    pricePrecision: s.digits,
    volumePrecision: 4,
  };
}

export { toProSymbol };
export type { KLineChartProHandle };

/**
 * Single native klinecharts-pro chart. Replaces the former multi-cell grid:
 * one shared datafeed, one KLineChartPro instance with the native chrome
 * (drawing bar, period bar, symbol search, indicator/timezone/settings
 * modals). Symbol / period are driven declaratively via props; native UI
 * changes surface through onSymbolChange / onPeriodChange.
 */
export const NativeChart: React.FC<Props> = ({
  symbol,
  timeframe,
  theme,
  onSymbolChange,
  onPeriodChange,
  onChartReady,
}) => {
  // One datafeed per mount; bitgetWs multiplexes subscriptions internally.
  const datafeed = useMemo(() => new BitgetDatafeed(), []);

  // Stable pro-level values; ref changes only on real symbol/period switch.
  const proSymbol = useMemo(
    () => toProSymbol(symbol),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbol.id, symbol.ticker],
  );
  const period: Period = useMemo(
    () => periodFromTimeframe(timeframe),
    [timeframe],
  );

  return (
    <div className="flex-1 h-full w-full overflow-hidden">
      <KLineChartProView
        symbol={proSymbol}
        period={period}
        datafeed={datafeed}
        theme={theme}
        locale="zh-CN"
        watermarkText={symbol.ticker}
        onSymbolChange={onSymbolChange}
        onPeriodChange={onPeriodChange}
        onReady={onChartReady}
      />
    </div>
  );
};
