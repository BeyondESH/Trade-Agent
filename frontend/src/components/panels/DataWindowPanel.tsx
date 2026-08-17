import type { Candle } from "../../api/types";
import { useI18n } from "../../lib/i18n";

interface Props {
  symbol: string;
  timeframe: string;
  candles: Candle[];
}

function fmt(v: number | undefined): string {
  return v == null ? "--" : Number.isFinite(v) ? String(v) : "--";
}

/** Right sidebar Data Window tab: current OHLCV + series info. */
export function DataWindowPanel({ symbol, timeframe, candles }: Props) {
  const { t } = useI18n();
  const last = candles.length ? candles[candles.length - 1] : undefined;
  const rows: [string, string][] = [
    ["O", fmt(last?.open)],
    ["H", fmt(last?.high)],
    ["L", fmt(last?.low)],
    ["C", fmt(last?.close)],
    ["V", fmt(last?.volume)],
  ];
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="data-window">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs font-semibold">
        <span>{symbol}</span>
        <span className="text-muted">{timeframe}</span>
      </div>
      <div className="p-3">
        <div className="flex flex-col gap-1 text-xs tnum">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between">
              <span className="font-medium text-muted">{k}</span>
              <span className="text-text">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
