import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ThemeMode } from "../../../types/trading";
import type { BacktestJobResult } from "../../../api/types";
import { monthlyReturns, returnsHistogram, tradePnl } from "../../../lib/chartData";
import { Panel } from "./ui";

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

/** Recharts economics graphs derived from a completed backtest result. */
export const EconCharts: React.FC<{ result: BacktestJobResult; theme: ThemeMode }> = ({
  result,
  theme,
}) => {
  const sr = result.series;
  const equity = sr?.equity ?? [];
  const openTime = sr?.open_time ?? [];

  const equityData = equity.map((v, i) => ({ i, equity: v }));
  const drawdownData = (sr?.drawdown ?? []).map((v, i) => ({ i, drawdown: v * 100 }));
  const monthly = monthlyReturns(equity, openTime);
  const pnl = tradePnl(result.trade_list ?? []);
  const hist = returnsHistogram(equity);

  const tick = axisTick(theme);
  const grid = gridStroke(theme);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="权益曲线" theme={theme}>
        {equityData.length > 1 ? (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={equityData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey="i" tick={tick} tickLine={false} axisLine={{ stroke: grid }} />
              <YAxis tick={tick} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
              <Tooltip />
              <Area type="monotone" dataKey="equity" stroke={ACCENT} fill={ACCENT} fillOpacity={0.12} />
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

      <Panel title="月度收益" theme={theme}>
        {monthly.length > 0 ? (
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
