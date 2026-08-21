import React from "react";
import { ThemeMode, SymbolInfo } from "../../../types/trading";
import type { BacktestParams } from "../../../api/types";
import { Panel, Field, btnCls, inputCls, selectCls } from "./ui";
import { Slider } from "../../ui/slider";

/** All valid persistence timeframes (mirrors backend models.VALID_TIMEFRAMES). */
export const DL_TIMEFRAMES = [
  "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "3d", "1w", "1mo",
] as const;
export const DEFAULT_PARAMS: BacktestParams = { train_ratio: 0.7, thresh: 0.55, fee: 0.0004, slippage: 0.0005 };

export interface TimeRange {
  start?: number;
  end?: number;
}

export const RANGE_PRESETS: { label: string; days: number }[] = [
  { label: "全部", days: 0 },
  { label: "近3月", days: 90 },
  { label: "近6月", days: 180 },
  { label: "近1年", days: 365 },
];

interface Props {
  symbols: SymbolInfo[];
  symbol: string;
  timeframe: string;
  range: TimeRange;
  params: BacktestParams;
  running: boolean;
  error: string | null;
  onSymbol: (s: string) => void;
  onTimeframe: (tf: string) => void;
  onRange: (r: TimeRange) => void;
  onParams: (p: BacktestParams) => void;
  onRun: () => void;
  theme: ThemeMode;
}

const SliderField: React.FC<{
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  theme: ThemeMode;
  fmt?: (v: number) => string;
}> = ({ label, value, min, max, step, onChange, theme, fmt }) => {
  const v = value ?? min;
  return (
    <label className="flex flex-col gap-1 text-xs min-w-40">
      <span className="text-gray-400 font-medium">
        {label} <span className="font-mono">{fmt ? fmt(v) : v}</span>
      </span>
      <div className="flex items-center gap-2">
        <Slider
          min={min}
          max={max}
          step={step}
          value={[v]}
          onValueChange={(vals) => onChange(vals[0])}
          className="flex-1"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(v) ? v : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className={`${inputCls(theme)} w-20 text-right`}
        />
      </div>
    </label>
  );
};

const DateInput: React.FC<{
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  theme: ThemeMode;
}> = ({ label, value, onChange, theme }) => {
  const iso = value ? new Date(value).toISOString().slice(0, 10) : "";
  return (
    <Field label={label}>
      <input
        type="date"
        value={iso}
        onChange={(e) => {
          const d = e.target.value ? new Date(`${e.target.value}T00:00:00Z`).getTime() : undefined;
          onChange(d);
        }}
        className={inputCls(theme)}
      />
    </Field>
  );
};

/** Symbol / timeframe / time-range / training-param controls plus the run button. */
export const BacktestControls: React.FC<Props> = ({
  symbols,
  symbol,
  timeframe,
  range,
  params,
  running,
  error,
  onSymbol,
  onTimeframe,
  onRange,
  onParams,
  onRun,
  theme,
}) => {
  const applyPreset = (days: number) => {
    if (days <= 0) {
      onRange({ start: undefined, end: undefined });
      return;
    }
    onRange({ start: Date.now() - days * 86_400_000, end: undefined });
  };
  return (
    <Panel title="回测参数" theme={theme}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="标的">
          <select
            value={symbol}
            onChange={(e) => onSymbol(e.target.value)}
            className={selectCls(theme)}
          >
            {symbols.map((s) => (
              <option key={s.id} value={s.id}>
                {s.ticker}
              </option>
            ))}
          </select>
        </Field>
        <Field label="周期">
          <select value={timeframe} onChange={(e) => onTimeframe(e.target.value)} className={selectCls(theme)}>
            {DL_TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </Field>
        <Field label="时间区间">
          <div className="flex items-end gap-1.5">
            <select
              value=""
              onChange={(e) => {
                const p = RANGE_PRESETS.find((x) => x.label === e.target.value);
                if (p) applyPreset(p.days);
              }}
              className={selectCls(theme)}
            >
              <option value="" disabled>
                预设…
              </option>
              {RANGE_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>
            <DateInput label="起" value={range.start} onChange={(v) => onRange({ ...range, start: v })} theme={theme} />
            <DateInput label="止" value={range.end} onChange={(v) => onRange({ ...range, end: v })} theme={theme} />
          </div>
        </Field>
        <SliderField label="训练比例" value={params.train_ratio} min={0.1} max={0.9} step={0.05} onChange={(v) => onParams({ ...params, train_ratio: v })} theme={theme} />
        <SliderField label="信号阈值" value={params.thresh} min={0.5} max={0.9} step={0.05} onChange={(v) => onParams({ ...params, thresh: v })} theme={theme} />
        <SliderField label="手续费" value={params.fee} min={0} max={0.01} step={0.0001} onChange={(v) => onParams({ ...params, fee: v })} theme={theme} fmt={(v) => (v * 100).toFixed(2) + "%"} />
        <SliderField label="滑点" value={params.slippage} min={0} max={0.01} step={0.0001} onChange={(v) => onParams({ ...params, slippage: v })} theme={theme} fmt={(v) => (v * 100).toFixed(2) + "%"} />
        <button onClick={onRun} disabled={running} className={btnCls(theme)}>
          {running ? "运行中..." : "Run Backtest"}
        </button>
      </div>
      {error && <span className="text-xs text-[#f23645]">{error}</span>}
    </Panel>
  );
};
