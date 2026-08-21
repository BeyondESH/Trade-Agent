import React, { useMemo, useState } from "react";
import { ThemeMode } from "../../../types/trading";
import type { SweepResult, SweepRow } from "../../../api/types";
import { Panel, btnCls, fmtPct, inputCls } from "./ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";

interface Props {
  running: boolean;
  result: SweepResult | null;
  onRun: (thresholds: number[], fees?: number[], slippages?: number[]) => void;
  theme: ThemeMode;
}

const DEFAULT_THRESHOLDS = [0.5, 0.55, 0.6, 0.65, 0.7];
const DEFAULT_FEES = [0.0002, 0.0004, 0.001];
const DEFAULT_SLIPPAGES = [0.0005];

/** Parse a comma/space separated number list; fall back to `fallback`. */
export function parseGridInput(text: string, fallback: number[]): number[] {
  const nums = text
    .split(/[\s,，]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  return nums.length > 0 ? nums : fallback;
}

/** Map a total_return to a heatmap color: positive -> blue accent,
 * negative -> red. Returns a CSS rgb() string. */
export function heatColor(value: number): string {
  const t = Math.max(-0.05, Math.min(0.05, value));
  const ratio = t < 0 ? -t / 0.05 : t / 0.05;
  if (t >= 0) {
    const g = Math.round(0x29 + (0x89 - 0x29) * ratio);
    const b = Math.round(0x62 + (0x81 - 0x62) * ratio);
    return `rgb(41, ${g}, ${b})`;
  }
  const g = Math.round(0xf2 - (0xf2 - 0x13) * ratio);
  const b = Math.round(0x36 + (0x37 - 0x36) * ratio);
  return `rgb(${Math.round(0xf2 - (0xf2 - 0x89) * ratio)}, ${g}, ${b})`;
}

const RowDetail: React.FC<{ row: SweepRow }> = ({ row }) => (
  <div className="flex flex-col gap-1 text-xs font-mono">
    <div className="flex justify-between gap-4">
      <span className="text-gray-400">阈值</span>
      <span>{row.threshold.toFixed(2)}</span>
    </div>
    <div className="flex justify-between gap-4">
      <span className="text-gray-400">费用</span>
      <span>{(row.fee * 100).toFixed(3)}%</span>
    </div>
    <div className="flex justify-between gap-4">
      <span className="text-gray-400">滑点</span>
      <span>{(row.slippage * 100).toFixed(3)}%</span>
    </div>
    <div className="flex justify-between gap-4">
      <span className="text-gray-400">总收益</span>
      <span className="font-bold">{fmtPct(row.total_return)}</span>
    </div>
    <div className="flex justify-between gap-4">
      <span className="text-gray-400">最大回撤</span>
      <span>{fmtPct(row.max_drawdown)}</span>
    </div>
    <div className="flex justify-between gap-4">
      <span className="text-gray-400">胜率</span>
      <span>{fmtPct(row.win_rate)}</span>
    </div>
    <div className="flex justify-between gap-4">
      <span className="text-gray-400">交易数</span>
      <span>{row.trades}</span>
    </div>
  </div>
);

/** Threshold x fee heatmap of the parameter sweep, with tooltip + popover detail. */
export const SweepView: React.FC<Props> = ({ running, result, onRun, theme }) => {
  const [thrText, setThrText] = useState(DEFAULT_THRESHOLDS.join(", "));
  const [feeText, setFeeText] = useState(DEFAULT_FEES.join(", "));
  const [slipText, setSlipText] = useState(DEFAULT_SLIPPAGES.join(", "));

  const thresholds = useMemo(() => parseGridInput(thrText, DEFAULT_THRESHOLDS), [thrText]);
  const fees = useMemo(() => parseGridInput(feeText, DEFAULT_FEES), [feeText]);
  const slippages = useMemo(() => parseGridInput(slipText, DEFAULT_SLIPPAGES), [slipText]);

  const matrix = useMemo(() => {
    if (!result) return null;
    const rows = result.results;
    return thresholds.map((th) =>
      fees.map((fee) => {
        const match = rows.find(
          (r) => r.threshold === th && r.fee === fee,
        );
        return match ?? null;
      }),
    );
  }, [result, thresholds, fees]);

  const gridInput = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="flex flex-col gap-1 text-xs min-w-48">
      <span className="text-gray-400 font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="逗号分隔数值,如 0.5, 0.55, 0.6"
        className={inputCls(theme)}
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title="参数扫描 (阈值 × 费用)"
        theme={theme}
        right={
          <button
            onClick={() => onRun(thresholds, fees, slippages)}
            disabled={running}
            className={btnCls(theme, "ghost")}
          >
            {running ? "扫描中..." : result ? "重新扫描" : "运行参数扫描"}
          </button>
        }
      >
        <div className="flex flex-wrap items-end gap-3 border-b pb-2 border-gray-500/20">
          {gridInput("阈值列表", thrText, setThrText)}
          {gridInput("费用列表", feeText, setFeeText)}
          {gridInput("滑点列表", slipText, setSlipText)}
          <span className="text-[10px] text-gray-500">
            当前网格: {thresholds.length} 阈值 × {fees.length} 费用 × {slippages.length} 滑点
          </span>
        </div>
        {!result && !running && (
          <div className="text-sm text-gray-400 py-4 text-center">
            点击「运行参数扫描」以阈值×费用网格评估模型参数稳定性
          </div>
        )}
        {running && <div className="text-sm text-gray-400 py-4 text-center">正在扫描,请稍候...</div>}
        {matrix && !running && (
          <TooltipProvider delayDuration={100}>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-16 text-[10px] text-gray-400">阈值\\费用</span>
                {fees.map((f) => (
                  <span key={f} className="flex-1 text-center text-[10px] text-gray-400 font-mono">
                    {(f * 100).toFixed(2)}%
                  </span>
                ))}
              </div>
              {matrix.map((row, ri) => (
                <div key={ri} className="flex items-center gap-1.5">
                  <span className="w-16 text-[10px] text-gray-400 font-mono">
                    {thresholds[ri].toFixed(2)}
                  </span>
                  {row.map((cell, ci) => (
                    <div key={ci} className="flex-1">
                      {cell ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  className="h-10 w-full rounded-md border border-border/50 hover:opacity-80 transition-opacity"
                                  style={{ backgroundColor: heatColor(cell.total_return) }}
                                >
                                  <span className="text-[10px] font-mono font-bold text-white drop-shadow">
                                    {fmtPct(cell.total_return)}
                                  </span>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent>
                                <RowDetail row={cell} />
                              </PopoverContent>
                            </Popover>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="flex flex-col gap-0.5 font-mono">
                              <span>阈值 {cell.threshold.toFixed(2)} · 费用 {(cell.fee * 100).toFixed(2)}%</span>
                              <span>收益 {fmtPct(cell.total_return)}</span>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <div className="h-10 w-full rounded-md border border-border/30 bg-muted/40" />
                      )}
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1 text-[10px] text-gray-400">
                <span>收益色阶:</span>
                <span className="font-mono" style={{ color: heatColor(-0.05) }}>亏损</span>
                <span className="text-gray-400">→</span>
                <span className="font-mono" style={{ color: heatColor(0.05) }}>盈利</span>
              </div>
            </div>
          </TooltipProvider>
        )}
      </Panel>
    </div>
  );
};
