import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ThemeMode } from "../../../types/trading";
import type { BacktestJobResult } from "../../../api/types";
import { Panel } from "./ui";

const ACCENT = "#2962ff";
const WIN = "#089981";
const LOSS = "#f23645";

const axisTick = (theme: ThemeMode) => ({
  fontSize: 10,
  fill: theme === "dark" ? "#787b86" : "#606470",
});

const gridStroke = (theme: ThemeMode) => (theme === "dark" ? "#2a2e39" : "#e0e3eb");

const Empty: React.FC<{ label: string }> = ({ label }) => (
  <div className="text-xs text-gray-400 py-4 text-center">{label}</div>
);

/** Model diagnostics: ROC curve (with AUC) and feature-weight bar chart. */
export const ModelDiagnostics: React.FC<{ result: BacktestJobResult; theme: ThemeMode }> = ({
  result,
  theme,
}) => {
  const tick = axisTick(theme);
  const grid = gridStroke(theme);

  const rc = result.roc_curve;
  const rocData = rc ? rc.fpr.map((f, i) => ({ fpr: f, tpr: rc.tpr[i] ?? 0 })) : [];
  const auc = result.model_metrics?.roc_auc;

  const fw = result.feature_weights;
  const weightData =
    fw && fw.values.length === fw.features.length
      ? fw.features.map((name, i) => ({ name, value: fw.values[i] }))
      : [];

  return (
    <div className="flex flex-col gap-4">
      <Panel title="ROC 曲线" theme={theme}>
        {rocData.length > 1 ? (
          <div className="flex flex-col gap-1">
            <div className="text-xs font-mono text-gray-400">
              AUC:{" "}
              <span className="font-bold text-[#2962ff]">
                {auc != null ? auc.toFixed(4) : "—"}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={rocData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="fpr"
                  type="number"
                  domain={[0, 1]}
                  tick={tick}
                  tickLine={false}
                  axisLine={{ stroke: grid }}
                />
                <YAxis
                  type="number"
                  domain={[0, 1]}
                  tick={tick}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip formatter={(v) => Number(v).toFixed(4)} />
                <Line
                  type="monotone"
                  dataKey="tpr"
                  stroke={ACCENT}
                  dot={false}
                  strokeWidth={1.5}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty label="无 ROC 数据(测试集退化或旧记录)" />
        )}
      </Panel>

      <Panel
        title={
          fw?.kind === "coef" ? "特征权重 (逻辑回归系数)" : "特征权重 (特征重要性)"
        }
        theme={theme}
      >
        {weightData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(120, weightData.length * 28)}>
            <BarChart
              data={weightData}
              layout="vertical"
              margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
            >
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis type="number" tick={tick} tickLine={false} axisLine={{ stroke: grid }} />
              <YAxis
                type="category"
                dataKey="name"
                width={90}
                tick={{ ...tick, fontSize: 9 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                {weightData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={fw?.kind === "coef" ? (d.value >= 0 ? WIN : LOSS) : ACCENT}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty label="无特征权重数据(旧记录或该模型不导出)" />
        )}
      </Panel>
    </div>
  );
};
