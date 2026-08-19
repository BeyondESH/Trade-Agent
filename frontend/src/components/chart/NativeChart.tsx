import { useEffect, useMemo, useRef, useState } from 'react';
import type { Period, SymbolInfo as ProSymbolInfo } from '@klinecharts/pro';
import type { SymbolInfo, ThemeMode } from '../../types/trading';
import { BitgetDatafeed, periodFromTimeframe } from '../../api/datafeed';
import { KLineChartProView, type KLineChartProHandle } from './KLineChartProView';
import type { Chart } from 'klinecharts';
import { ChartContextMenu } from './ChartContextMenu';
import { PriceLineSettingsModal } from './PriceLineSettingsModal';
import {
  alertLinesToDraw,
  isInsidePane,
  pixelToPrice,
  syncPriceLineOverlays,
} from '../../lib/chartController';
import {
  createAlert,
  loadAlertsForSymbol,
  mirrorAlertCreate,
  mirrorAlertDelete,
  mirrorAlertUpdate,
  removeAlert,
  subscribeAlerts,
  updateAlert,
  upsertAlert,
  type Alert,
} from '../../lib/alertsStore';

interface Props {
  symbol: SymbolInfo;
  timeframe: string;
  theme: ThemeMode;
  onSymbolChange?: (s: ProSymbolInfo) => void;
  onPeriodChange?: (p: Period) => void;
  onChartReady?: (c: Chart | null) => void;
  /** Open the create-alert modal prefilled with a price (from the right-click menu). */
  onCreateAlertAt?: (price: number) => void;
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
 *
 * Price lines (reference + alert lines) are projected from the alertsStore
 * onto the chart; right-click on the candle pane opens a context menu to add
 * a price line or set a price alert at the cursor's price, and left-clicking
 * a line opens its settings popup.
 */
export const NativeChart: React.FC<Props> = ({
  symbol,
  timeframe,
  theme,
  onSymbolChange,
  onPeriodChange,
  onChartReady,
  onCreateAlertAt,
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

  const chartRef = useRef<Chart | null>(null);
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const [chartReady, setChartReady] = useState(false);

  // Current symbol's price-line entities (source of truth for overlays).
  const [alerts, setAlerts] = useState<Alert[]>(() =>
    loadAlertsForSymbol(symbol.ticker),
  );
  const [menu, setMenu] = useState<{ x: number; y: number; price: number } | null>(null);
  const [settingsAlertId, setSettingsAlertId] = useState<string | null>(null);

  // Keep the local snapshot in sync with the store (external changes, drags...).
  useEffect(() => {
    const off = subscribeAlerts(() =>
      setAlerts(loadAlertsForSymbol(symbolRef.current.ticker)),
    );
    return off;
  }, []);

  // Re-filter when the symbol changes.
  useEffect(() => {
    setAlerts(loadAlertsForSymbol(symbol.ticker));
  }, [symbol.ticker]);

  // Project the store onto the chart: remove the price-line group, then redraw.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    syncPriceLineOverlays(chart, alertLinesToDraw(alerts, symbol.ticker, theme), {
      onClick: (alertId) => setSettingsAlertId(alertId),
      onDragEnd: (alertId, price) => {
        updateAlert(alertId, { threshold: price });
        mirrorAlertUpdate(alertId, { threshold: price });
      },
    });
  }, [alerts, symbol.ticker, theme, chartReady]);

  const handleChartReady = (c: Chart | null) => {
    chartRef.current = c;
    setChartReady(!!c);
    if (c) setAlerts(loadAlertsForSymbol(symbolRef.current.ticker));
    onChartReady?.(c);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const chart = chartRef.current;
    if (!chart) return;
    // Only the canvas area of the candle main pane opens the menu.
    if ((e.target as HTMLElement)?.tagName !== 'CANVAS') return;
    if (!isInsidePane(chart, 'candle_pane', e.clientX, e.clientY)) return;
    const price = pixelToPrice(chart, e.clientX, e.clientY);
    if (price === null) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, price });
  };

  const handleAddPriceLine = (price: number) => {
    const alert = createAlert({
      symbol: symbolRef.current.ticker,
      condition: 'above',
      threshold: price,
      enabled: false,
    });
    upsertAlert(alert);
    mirrorAlertCreate(alert);
    setMenu(null);
  };

  const handleCreateAlertAt = (price: number) => {
    setMenu(null);
    onCreateAlertAt?.(price);
  };

  const handleSaveSettings = (
    id: string,
    patch: Partial<Omit<Alert, 'id' | 'symbol' | 'createdAt'>>,
  ) => {
    updateAlert(id, patch);
    mirrorAlertUpdate(id, patch);
  };

  const handleDeleteSettings = (id: string) => {
    removeAlert(id);
    mirrorAlertDelete(id);
  };

  const settingsAlert = settingsAlertId
    ? alerts.find((a) => a.id === settingsAlertId)
    : null;

  return (
    <div
      className="relative flex-1 h-full w-full overflow-hidden"
      onContextMenu={handleContextMenu}
    >
      <KLineChartProView
        symbol={proSymbol}
        period={period}
        datafeed={datafeed}
        theme={theme}
        locale="zh-CN"
        watermarkText={symbol.ticker}
        onSymbolChange={onSymbolChange}
        onPeriodChange={onPeriodChange}
        onReady={handleChartReady}
      />

      {menu && (
        <ChartContextMenu
          x={menu.x}
          y={menu.y}
          price={menu.price}
          symbol={symbol.ticker}
          theme={theme}
          onAddPriceLine={handleAddPriceLine}
          onCreateAlertAt={handleCreateAlertAt}
          onClose={() => setMenu(null)}
        />
      )}

      {settingsAlert && (
        <PriceLineSettingsModal
          alert={settingsAlert}
          theme={theme}
          onSave={handleSaveSettings}
          onDelete={handleDeleteSettings}
          onClose={() => setSettingsAlertId(null)}
        />
      )}
    </div>
  );
};
