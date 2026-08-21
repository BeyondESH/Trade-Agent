import React, { useMemo, useState } from "react";
import { ThemeMode } from "../../../types/trading";
import type { WalkForwardResult, WalkForwardFold } from "../../../api/types";
import { Panel, btnCls, fmtPct, inputCls } from "./ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";

interface Props {
  running: boolean;
  result: WalkForwardResult | null;
  onRun: (nSplits?: number) => void;
  theme: ThemeMode;
  error?: string | null;
}

const WINDOW_STROKES = ["#2962ff", "#089981", "#ff9800", "#e040fb", "#00bcd4"];

/** Horizontal bars showing each fold's train/test segments on a shared axis. */
export const FoldRanges: React.FC<{ folds: WalkForwardFold[]; theme: ThemeMode }> = ({
  folds,
  theme,
}) => {
  const { min, max } = useMemo(() => {
    const all = folds.flatMap((f) => [f.train_start, f.train_end, f.test_start, f.test_end]);
    return { min: Math.min(...all), max: Math.max(...all) };
  }, [folds]);

  if (min === max) return null;
  const span = max - min;
  const pos = (v: number) => ((v - min) / span) * 100;
  const barColor = theme === "dark" ? "#1e222d" : "#f0f3fa";

  return (
    <div className="flex flex-col gap-2">
      {folds.map((f) => (
        <div key={f.fold} className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-[10px] text-gray-400 font-mono">#{f.fold + 1}</span>
          <div className="relative h-6 flex-1 rounded bg-muted/40 overflow-hidden" style={{ backgroundColor: barColor }}>
            <div
              className="absolute top-1 bottom-1 rounded-sm"
              style={{
                left: `${pos(f.train_start)}%`,
                width: `${pos(f.train_end) - pos(f.train_start)}%`,
                backgroundColor: WINDOW_STROKES[f.fold % WINDOW_STROKES.length],
                opacity: 0.35,
              }}
              title={`训练 ${f.train_start}→${f.train_end}`}
            />
            <div
              className="absolute top-0 bottom-0 rounded-sm"
              style={{
                left: `${pos(f.test_start)}%`,
                width: `${pos(f.test_end) - pos(f.test_start)}%`,
                backgroundColor: WINDOW_STROKES[f.fold % WINDOW_STROKES.length],
              }}
              title={`测试 ${f.test_start}→${f.test_end}`}
            />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 pl-10 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm opacity-40" style={{ backgroundColor: "#2962ff" }} /> 训练段</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: "#2962ff" }} /> 测试段</span>
      </div>
    </div>
  );
};

/** Multi-fold walk-forward: fold metric table + train/test range bars. */
export const WalkForwardView: React.FC<Props> = ({ running, result, onRun, theme, error }) => {
  const folds = result?.folds ?? [];
  const [nSplits, setNSplits] = useState<string>("");
  const parsedNSplits = nSplits.trim() === "" ? undefined : Number(nSplits);
  const nValid = parsedNSplits === undefined || Number.isFinite(parsedNSplits);

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title="Walk-forward 稳定性"
        theme={theme}
        right={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-gray-400">
              折数
              <input
                type="number"
                min={2}
                value={nSplits}
                onChange={(e) => setNSplits(e.target.value)}
                placeholder="自动"
                className={`${inputCls(theme)} w-20 text-right`}
              />
            </label>
            <button
              onClick={() => onRun(nValid ? parsedNSplits : undefined)}
              disabled={running || !nValid}
              className={btnCls(theme, "ghost")}
            >
              {running ? "运行中..." : result ? "重新运行" : "运行 Walk-forward"}
            </button>
          </div>
        }
      >
        {error && <span className="text-xs text-[#f23645]">✕ {error}</span>}
        {!nValid && (
          <span className="text-xs text-[#f23645]">✕ 折数必须为数字(留空表示自动)</span>
        )}
        {!result && !running && (
          <div className="text-sm text-gray-400 py-4 text-center">
            点击「运行 Walk-forward」以多折时间序列验证模型稳定性
          </div>
        )}
        {running && <div className="text-sm text-gray-400 py-4 text-center">多折训练中,请稍候...</div>}
        {result && !running && (
          <div className="flex flex-col gap-3">
            <FoldRanges folds={folds} theme={theme} />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>折次</TableHead>
                  <TableHead>测试区间</TableHead>
                  <TableHead>AUC</TableHead>
                  <TableHead>LogLoss</TableHead>
                  <TableHead>收益</TableHead>
                  <TableHead>回撤</TableHead>
                  <TableHead>胜率</TableHead>
                  <TableHead>交易</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {folds.map((f) => (
                  <TableRow key={f.fold}>
                    <TableCell className="font-mono">#{f.fold + 1}</TableCell>
                    <TableCell className="font-mono text-[11px]">
                      {new Date(f.test_start).toISOString().slice(0, 10)} →{" "}
                      {new Date(f.test_end).toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="font-mono">{f.roc_auc != null ? f.roc_auc.toFixed(3) : "—"}</TableCell>
                    <TableCell className="font-mono">{f.log_loss != null ? f.log_loss.toFixed(3) : "—"}</TableCell>
                    <TableCell className={`font-mono font-bold ${f.total_return >= 0 ? "text-[#089981]" : "text-[#f23645]"}`}>
                      {fmtPct(f.total_return)}
                    </TableCell>
                    <TableCell className="font-mono">{fmtPct(f.max_drawdown)}</TableCell>
                    <TableCell className="font-mono">{fmtPct(f.win_rate)}</TableCell>
                    <TableCell className="font-mono">{f.trades}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </div>
  );
};
