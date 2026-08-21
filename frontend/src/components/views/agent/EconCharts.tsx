import React, { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ThemeMode } from "../../../types/trading";
import type { BacktestJobResult } from "../../../api/types";
import {
  equityVsBenchmark,
  monthlyHeatmap,
  monthlyReturns,
  probaThresholdData,
  returnsHistogram,
  tradePnl,
} from "../../../lib/chartData";
import { Panel, btnCls } from "./ui";

const WIN = "#089981";
const LOSS = "#f23645";
const ACCENT = "#2962ff";

const axisTick = (theme: ThemeMode) => ({
  fontSize: 10,
  fill: theme === "dark" ? "#787b86" : "#606470",
});

const gridStroke = (theme: ThemeMode) => (theme === "dark" ? "#2a2e39" : "#e0e3eb");

const Empty: React.FC<{ label: string }> = ({ label }) => (
  <div className="text-xs text-gray-400 py-4 text-center">{label}</div>
);

/** TradingView-style year x month return heatmap. */
const MonthlyHeatmap: React.FC<{ cells: ReturnType<typeof monthlyHeatmap>; theme: ThemeMode }> = ({
  cells,
  theme,
}) => {
  const { years, cells: items } = cells;
  const cellColor = (v: number) => {
    const t = Math.max(-0.1, Math.min(0.1, v));
    const ratio = t < 0 ? -t / 0.1 : t / 0.1;
    if (t >= 0) {
      const g = Math.round(0x13 + (0x89 - 0x13) * ratio);
      const b = Math.round(0x13 + (0x81 - 0x13) * ratio);
      return `rgba(19, ${g}, ${b}, ${0.25 + 0.6 * ratio})`;
    }
    const r = Math.round(0xf2 - (0xf2 - 0xf2) * ratio);
    const g = Math.round(0x36 + (0x36 - 0x8c) * ratio);
    return `rgba(${Math.round(0xf2 - (0xf2 - 0xd0) * ratio)}, ${g}, 54, ${0.25 + 0.6 * ratio})`;
  };

  return (
    <div className="flex flex-col gap-1 text-[10px] font-mono">
      <div className="flex gap-1">
        <span className="w-8 shrink-0" />
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="flex-1 text-center text-gray-400">
            {i + 1}月
          </span>
        ))}
      </div>
      {years.map((y) => (
        <div key={y} className="flex gap-1 items-center">
          <span className="w-8 shrink-0 text-gray-400">{y}</span>
          {Array.from({ length: 12 }, (_, mi) => {
            const cell = items.find((c) => c.year === y && c.month === mi + 1);
            return (
              <div
                key={mi}
                className="flex-1 h-6 rounded-sm flex items-center justify-center border border-black/5"
                style={{ backgroundColor: cell ? cellColor(cell.value) : "transparent" }}
                title={cell ? `${y}-${mi + 1}: ${(cell.value * 100).toFixed(2)}%` : undefined}
              >
                {cell ? <span className="text-white drop-shadow">{cell.value >= 0 ? "+" : ""}{(cell.value * 100).toFixed(1)}%</span> : null}
              </div>
            );
          })}
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1 text-gray-400">
        <span className="text-[10px]">月度收益色阶:</span>
        <span className="text-[10px]" style={{ color: LOSS }}>亏损</span>
        <span className="text-[10px] text-gray-400">→</span>
        <span className="text-[10px]" style={{ color: WIN }}>盈利</span>
        <span className="ml-auto text-[10px]">{theme === "dark" ? "深色底" : "浅色底"} · 点击切换视图</span>
      </div>
    </div>
  );
};

/** Recharts economics graphs derived from a completed backtest result. */
export const EconCharts: React.FC<{
  result: BacktestJobResult;
  theme: ThemeMode;
  thresh?: number;
}> = ({ result, theme, thresh = 0.55 }) => {
  const [monthlyView, setMonthlyView] = useState<"heatmap" | "bar">("heatmap");
  const sr = result.series;
  const equity = sr?.equity ?? [];
  const openTime = sr?.open_time ?? [];

  const equityData = equityVsBenchmark(equity, sr?.benchmark);
  const drawdownData = (sr?.drawdown ?? []).map((v, i) => ({ i, drawdown: v * 100 }));
  const monthly = monthlyReturns(equity, openTime);
  const heatmap = monthlyHeatmap(monthly);
  const pnl = tradePnl(result.trade_list ?? []);
  const hist = returnsHistogram(equity);
  const probaData = probaThresholdData(sr?.proba ?? [], thresh);

  const tick = axisTick(theme);
  const grid = gridStroke(theme);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="权益曲线 (vs 基准)" theme={theme}>
        {equityData.length > 1 ? (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={equityData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey="i" tick={tick} tickLine={false} axisLine={{ stroke: grid }} />
              <YAxis tick={tick} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
              <Tooltip />
              <Area type="monotone" dataKey="equity" stroke={ACCENT} fill={ACCENT} fillOpacity={0.12} />
              <Line
                type="monotone"
                dataKey="benchmark"
                stroke={theme === "dark" ? "#787b86" : "#b2b5be"}
                dot={false}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <Empty label="权益序列点数不足" />
        )}
      </Panel>

      <Panel title="回撤曲线" theme={theme}>
        {drawdownData.length > 1 ? (
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={drawdownData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey="i" tick={tick} tickLine={false} axisLine={{ stroke: grid }} />
              <YAxis tick={tick} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} />
              <Area type="monotone" dataKey="drawdown" stroke={LOSS} fill={LOSS} fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <Empty label="回撤序列点数不足" />
        )}
      </Panel>

      <Panel title="模型概率 + 阈值带" theme={theme}>
        {probaData.length > 1 ? (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={probaData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey="i" tick={tick} tickLine={false} axisLine={{ stroke: grid }} />
              <YAxis domain={[0, 1]} tick={tick} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => Number(v).toFixed(3)} />
              <Line type="monotone" dataKey="proba" stroke={ACCENT} dot={false} strokeWidth={1.2} />
              <ReferenceLine y={thresh} stroke={WIN} strokeDasharray="4 4" />
              <ReferenceLine y={1 - thresh} stroke={LOSS} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <Empty label="proba 序列点数不足" />
        )}
      </Panel>

      <Panel
        title="月度收益"
        theme={theme}
        right={
          <button
            onClick={() => setMonthlyView((v) => (v === "heatmap" ? "bar" : "heatmap"))}
            className={btnCls(theme, "ghost") + " !px-2 !py-1 text-xs"}
          >
            {monthlyView === "heatmap" ? "切换柱状图" : "切换热力图"}
          </button>
        }
      >
        {monthly.length > 0 ? (
          monthlyView === "heatmap" ? (
            <MonthlyHeatmap cells={heatmap} theme={theme} />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthly} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={tick} tickLine={false} axisLine={{ stroke: grid }} />
                <YAxis tick={tick} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => `${(Number(v) * 100).toFixed(2)}%`} />
                <Bar dataKey="value">
                  {monthly.map((m, i) => (
                    <Cell key={i} fill={m.value >= 0 ? WIN : LOSS} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        ) : (
          <Empty label="无法按月度聚合" />
        )}
      </Panel>

      <Panel title="单笔交易盈亏" theme={theme}>
        {pnl.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={pnl} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey="id" tick={tick} tickLine={false} axisLine={{ stroke: grid }} />
              <YAxis tick={tick} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => `${(Number(v) * 100).toFixed(2)}%`} />
              <Bar dataKey="pnl">
                {pnl.map((p, i) => (
                  <Cell key={i} fill={p.pnl >= 0 ? WIN : LOSS} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty label="无开单记录" />
        )}
      </Panel>

      <Panel title="收益分布直方图" theme={theme}>
        {hist.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hist} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: grid }} />
              <YAxis tick={tick} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="count" fill={ACCENT} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty label="收益序列点数不足" />
        )}
      </Panel>
    </div>
  );
};
