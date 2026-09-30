import { Activity, Layers } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { t } from "../../lib/i18n";
import { extractSeries, fetchMarketPulse, type MarketPulseEntry } from "../../lib/marketPulse";
import type { Candle, IndicatorConfig, SymbolInfo } from "../../types/trading";

interface Props {
  symbol: SymbolInfo;
  activeCandle: Candle | null;
  indicators: IndicatorConfig[];
  theme: "dark" | "light";
}

const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  if (values.length < 2) return null;
  const w = 96;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map(
      (v, i) =>
        `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`,
    )
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={w} height={h} className={`ml-auto ${up ? "text-up" : "text-down"}`}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="currentColor" opacity="0.12" />
    </svg>
  );
};

export const DataWindowPanel: React.FC<Props> = ({ symbol, activeCandle, indicators }) => {
  const [pulse, setPulse] = useState<MarketPulseEntry[]>([]);
  const [pulseLoading, setPulseLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchMarketPulse().then((rows) => {
      if (!alive) return;
      setPulse(rows);
      setPulseLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const dxy = pulse.find((p) => p.endpoint === "dxy");
  const dxySeries = dxy ? extractSeries(dxy.raw) : [];

  return (
    <div
      id="data-window-panel"
      className="flex flex-col h-full w-full select-none text-xs bg-surface text-content"
    >
      <div className="p-2.5 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <Layers className="w-4 h-4 text-signal" />
          <span>{t("Data Window")}</span>
        </div>
        <span className="text-2xs text-faint font-mono">{symbol.ticker}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 font-mono text-xs">
        {/* Current Bar Info */}
        <div className="p-2.5 rounded-lg border border-line bg-surface-2 flex flex-col gap-1.5">
          <div className="font-sans ta-eyebrow text-faint mb-1">{t("Price Bar (OHLCV)")}</div>
          {activeCandle ? (
            <>
              <div className="flex justify-between">
                <span className="text-faint font-sans">{t("Open")}</span>
                <span>{activeCandle.open.toFixed(symbol.digits)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-faint font-sans">{t("High")}</span>
                <span>{activeCandle.high.toFixed(symbol.digits)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-faint font-sans">{t("Low")}</span>
                <span>{activeCandle.low.toFixed(symbol.digits)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-faint font-sans">{t("Close")}</span>
                <span className={activeCandle.close >= activeCandle.open ? "text-up" : "text-down"}>
                  {activeCandle.close.toFixed(symbol.digits)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-faint font-sans">{t("Volume")}</span>
                <span>{activeCandle.volume.toLocaleString()}</span>
              </div>
            </>
          ) : (
            <div className="text-muted font-sans text-center py-2">{t("No candle data")}</div>
          )}
        </div>

        {/* Indicators Readings */}
        <div className="p-2.5 rounded-lg border border-line bg-surface-2 flex flex-col gap-2">
          <div className="font-sans ta-eyebrow text-faint mb-1">Technical Plots</div>
          {indicators.map((ind) => (
            <div key={ind.id} className="flex items-center justify-between py-0.5">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ind.color }} />
                <span className="font-sans font-medium">{ind.name}</span>
              </div>
              <span className="text-muted">{ind.visible ? "Active" : "Hidden"}</span>
            </div>
          ))}
        </div>

        {/* Market Pulse — BlockBeats global metrics */}
        <div className="p-2.5 rounded-lg border border-line bg-surface-2 flex flex-col gap-1.5">
          <div className="font-sans ta-eyebrow text-faint mb-1 flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-signal" />
            Market Pulse
          </div>
          {pulseLoading && <div className="text-muted font-sans py-1">Loading...</div>}
          {!pulseLoading && pulse.length === 0 && (
            <div className="text-muted font-sans py-1">{t("Unavailable — check BB_API_KEY")}</div>
          )}
          {pulse.map((p) => (
            <div key={p.endpoint} className="flex items-center gap-2 py-0.5">
              <div className="flex-1 min-w-0">
                <div className="font-sans font-medium text-[11px] text-muted truncate">
                  {p.label}
                </div>
                <div className="font-mono ta-num text-[11px] truncate" title={p.value}>
                  {p.value}
                </div>
              </div>
              {p.endpoint === "dxy" && <Sparkline values={dxySeries} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
