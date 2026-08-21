import React from "react";
import { ThemeMode } from "../../../types/trading";
import type { FactorIc } from "../../../api/types";

export interface FactorIcPoint {
  bucket: number;
  factor: string;
  ic: number;
}

interface Props {
  /** Per-bucket IC time series; empty when the backend only returns aggregates. */
  series?: FactorIcPoint[];
  factors: FactorIc[];
  theme: ThemeMode;
}

/** IC time-series trend chart. The backend currently returns aggregate IC only;
 * until a per-period endpoint exists this renders a graceful degradation
 * notice instead of an empty plot. */
export const FactorIcChart: React.FC<Props> = ({ series = [], theme }) => {
  if (series.length < 2) {
    return (
      <div className="text-[11px] text-gray-400 py-2">
        暂无逐期 IC 时序数据 — 当前仅展示聚合 IC 排序;按时间窗口的 IC 趋势将在后端支持逐期 IC 后提供。
      </div>
    );
  }

  const factors = [...new Set(series.map((p) => p.factor))];
  const colors = ["#2962ff", "#089981", "#ff9800", "#e040fb", "#00bcd4"];
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: 120 }}
    >
      {factors.map((f, fi) => {
        const pts = series
          .filter((p) => p.factor === f)
          .map(
            (p) =>
              `${(p.bucket / 100) * 100},${20 - p.ic * 20 * (theme === "dark" ? 1 : 1)}`,
          )
          .join(" ");
        return (
          <g key={f}>
            <polyline
              points={pts}
              fill="none"
              stroke={colors[fi % colors.length]}
              strokeWidth={1.2}
            />
            <text x={1} y={fi * 6 + 8} fontSize={3.2} fill={colors[fi % colors.length]}>
              {f}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
