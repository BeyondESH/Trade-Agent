import React from "react";
import { ThemeMode, SymbolInfo } from "../../../types/trading";
import type { BacktestParams } from "../../../api/types";
import { Panel, Field, btnCls, inputCls, selectCls } from "./ui";

export const DL_TIMEFRAMES = ["1m", "1h", "4h", "1d"] as const;
export const DEFAULT_PARAMS: BacktestParams = { train_ratio: 0.7, thresh: 0.55, fee: 0.0004, slippage: 0.0005 };

interface Props {
  symbols: SymbolInfo[];
  symbol: string;
  timeframe: string;
  params: BacktestParams;
  running: boolean;
  error: string | null;
  onSymbol: (s: string) => void;
  onTimeframe: (tf: string) => void;
  onParams: (p: BacktestParams) => void;
  onRun: () => void;
  theme: ThemeMode;
}

const NumberInput: React.FC<{
  value: number | undefined;
  step: number;
  onChange: (v: number) => void;
  theme: ThemeMode;
}> = ({ value, step, onChange, theme }) => (
  <input
    type="number"
    step={step}
    value={value ?? ""}
    onChange={(e) => onChange(Number(e.target.value))}
    className={inputCls(theme)}
  />
);

/** Symbol / timeframe / training-param controls plus the run button. */
export const BacktestControls: React.FC<Props> = ({
  symbols,
  symbol,
  timeframe,
  params,
  running,
  error,
  onSymbol,
  onTimeframe,
  onParams,
  onRun,
  theme,
}) => (
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
      <Field label="训练比例">
        <NumberInput value={params.train_ratio} step={0.05} onChange={(v) => onParams({ ...params, train_ratio: v })} theme={theme} />
      </Field>
      <Field label="信号阈值">
        <NumberInput value={params.thresh} step={0.05} onChange={(v) => onParams({ ...params, thresh: v })} theme={theme} />
      </Field>
      <Field label="手续费">
        <NumberInput value={params.fee} step={0.0001} onChange={(v) => onParams({ ...params, fee: v })} theme={theme} />
      </Field>
      <Field label="滑点">
        <NumberInput value={params.slippage} step={0.0001} onChange={(v) => onParams({ ...params, slippage: v })} theme={theme} />
      </Field>
      <button onClick={onRun} disabled={running} className={btnCls(theme)}>
        {running ? "运行中..." : "Run Backtest"}
      </button>
    </div>
    {error && <span className="text-xs text-[#f23645]">{error}</span>}
  </Panel>
);
