import React from "react";
import { ThemeMode } from "../../../types/trading";
import type { BacktestParams } from "../../../api/types";
import { Panel, inputCls, selectCls, btnCls } from "./ui";
import { Slider } from "../../ui/slider";

export type ModelPresetId = "conservative-lr" | "aggressive-lr" | "hgb-fast" | "custom";

export interface ModelPreset {
  id: ModelPresetId;
  label: string;
  model: "lr" | "hgb";
  params: BacktestParams;
}

/** Four presets bundling model type + hyperparameters + execution knobs. */
export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: "conservative-lr",
    label: "稳健 lr",
    model: "lr",
    params: {
      model: "lr", scale: true, C: 1.0, max_iter: 200, solver: "lbfgs",
      train_ratio: 0.7, thresh: 0.6, fee: 0.0004, slippage: 0.0005,
      init_cash: 100_000, size: 1,
    },
  },
  {
    id: "aggressive-lr",
    label: "激进 lr",
    model: "lr",
    params: {
      model: "lr", scale: true, C: 0.1, max_iter: 500, solver: "lbfgs",
      train_ratio: 0.6, thresh: 0.5, fee: 0.0004, slippage: 0.0005,
      init_cash: 100_000, size: 1,
    },
  },
  {
    id: "hgb-fast",
    label: "HGB 快速",
    model: "hgb",
    params: {
      model: "hgb", scale: false, max_depth: 4, learning_rate: 0.1,
      min_samples_leaf: 10, max_iter: 300, train_ratio: 0.7, thresh: 0.55,
      fee: 0.0004, slippage: 0.0005, init_cash: 100_000, size: 1,
    },
  },
  { id: "custom", label: "自定义", model: "lr", params: {} },
];

/** Strip undefined keys so parameter snapshots can be compared. */
function normalize(p: BacktestParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) out[k] = v;
  return out;
}

/** Active preset id: the first template whose full snapshot matches params. */
export function matchPreset(params: BacktestParams): ModelPresetId {
  for (const p of MODEL_PRESETS) {
    if (p.id === "custom") continue;
    const a = normalize(p.params);
    const b = normalize(params);
    if (Object.keys(a).length !== Object.keys(b).length) continue;
    if (Object.entries(a).every(([k, v]) => b[k] === v)) return p.id;
  }
  return "custom";
}

const ParamSlider: React.FC<{
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
    <label className="flex flex-col gap-1 text-xs min-w-44 flex-1">
      <span className="text-gray-400 font-medium">
        {label} <span className="font-mono text-[#d1d4dc]">{fmt ? fmt(v) : v}</span>
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

interface Props {
  params: BacktestParams;
  onChange: (params: BacktestParams) => void;
  theme: ThemeMode;
}

/** Model layer interaction: preset templates, lr/hgb switch, hyperparameter
 * sliders, scaler toggle and backtest execution knobs. */
export const ModelPanel: React.FC<Props> = ({ params, onChange, theme }) => {
  const model = params.model ?? "lr";
  const active = matchPreset(params);

  const applyPreset = (p: ModelPreset) => {
    if (p.id === "custom") return;
    onChange({ ...p.params, model: p.model });
  };

  const patch = (p: Partial<BacktestParams>) => onChange({ ...params, ...p });
  const setModel = (m: "lr" | "hgb") => {
    // Switching models keeps the shared params but drops the other model's
    // hyperparameters so requests stay valid per-estimator.
    const next: BacktestParams = { ...params, model: m };
    if (m === "lr") {
      delete next.max_depth;
      delete next.learning_rate;
      delete next.min_samples_leaf;
    } else {
      delete next.C;
      delete next.solver;
    }
    onChange(next);
  };

  const segBtn = (id: "lr" | "hgb", label: string) => (
    <button
      onClick={() => setModel(id)}
      className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
        model === id
          ? "bg-[#2962ff] text-white"
          : theme === "dark"
            ? "text-[#787b86] hover:text-white"
            : "text-[#606470] hover:text-black"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Panel
      title="模型控制"
      theme={theme}
      right={
        <div className="flex items-center gap-1 flex-wrap">
          {MODEL_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              disabled={p.id === "custom"}
              className={btnCls(theme, active === p.id ? "primary" : "ghost") + " !px-2 !py-1 text-xs"}
              title={p.id === "custom" ? "修改任一参数即为自定义" : undefined}
            >
              {p.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400 font-medium">模型</span>
          {segBtn("lr", "逻辑回归 (lr)")}
          {segBtn("hgb", "梯度提升 (hgb)")}
          <label className="flex items-center gap-1.5 text-xs text-gray-400 font-medium ml-auto">
            <input
              type="checkbox"
              checked={params.scale !== false}
              onChange={(e) => patch({ scale: e.target.checked })}
              className="accent-[#2962ff]"
            />
            标准化 (StandardScaler)
          </label>
        </div>

        {model === "lr" && (
          <div className="flex flex-wrap gap-3">
            <ParamSlider
              label="正则强度 C"
              value={params.C}
              min={0.01}
              max={10}
              step={0.01}
              onChange={(v) => patch({ C: v })}
              theme={theme}
            />
            <ParamSlider
              label="最大迭代 max_iter"
              value={params.max_iter}
              min={50}
              max={2000}
              step={50}
              onChange={(v) => patch({ max_iter: v })}
              theme={theme}
            />
            <label className="flex flex-col gap-1 text-xs min-w-40 flex-1">
              <span className="text-gray-400 font-medium">求解器 solver</span>
              <select
                value={params.solver ?? "lbfgs"}
                onChange={(e) => patch({ solver: e.target.value })}
                className={selectCls(theme)}
              >
                <option value="lbfgs">lbfgs</option>
                <option value="liblinear">liblinear</option>
                <option value="newton-cg">newton-cg</option>
                <option value="saga">saga</option>
              </select>
            </label>
          </div>
        )}

        {model === "hgb" && (
          <div className="flex flex-wrap gap-3">
            <ParamSlider
              label="最大迭代 max_iter"
              value={params.max_iter}
              min={50}
              max={2000}
              step={50}
              onChange={(v) => patch({ max_iter: v })}
              theme={theme}
            />
            <ParamSlider
              label="最大深度 max_depth"
              value={params.max_depth}
              min={1}
              max={10}
              step={1}
              onChange={(v) => patch({ max_depth: v })}
              theme={theme}
            />
            <ParamSlider
              label="学习率 learning_rate"
              value={params.learning_rate}
              min={0.01}
              max={0.5}
              step={0.01}
              onChange={(v) => patch({ learning_rate: v })}
              theme={theme}
              fmt={(v) => v.toFixed(2)}
            />
            <ParamSlider
              label="叶最小样本 min_samples_leaf"
              value={params.min_samples_leaf}
              min={1}
              max={100}
              step={1}
              onChange={(v) => patch({ min_samples_leaf: v })}
              theme={theme}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-3 border-t pt-2 border-gray-500/20">
          <ParamSlider
            label="初始资金 init_cash"
            value={params.init_cash}
            min={1_000}
            max={10_000_000}
            step={10_000}
            onChange={(v) => patch({ init_cash: v })}
            theme={theme}
            fmt={(v) => v.toLocaleString()}
          />
          <ParamSlider
            label="仓位 size"
            value={params.size}
            min={0.01}
            max={1}
            step={0.01}
            onChange={(v) => patch({ size: v })}
            theme={theme}
            fmt={(v) => v.toFixed(2)}
          />
        </div>
      </div>
    </Panel>
  );
};
