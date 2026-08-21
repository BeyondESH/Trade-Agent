import React, { useState } from "react";
import { ThemeMode } from "../../../types/trading";
import type { FactorDef } from "../../../api/types";
import { Panel, btnCls, inputCls, selectCls } from "./ui";
import { FACTOR_CATALOG, newId } from "./factorCatalog";

interface Props {
  factors: FactorDef[];
  onChange: (factors: FactorDef[]) => void;
  theme: ThemeMode;
}

const EXPR_FORBIDDEN = ["__", "import", "lambda", ";", "=", ":", "[", "]", "'", '"'];

function validateExpr(expr: string): string | null {
  if (!expr.trim()) return "表达式不能为空";
  for (const tok of EXPR_FORBIDDEN) {
    if (expr.includes(tok)) return `包含禁止字符 "${tok}"`;
  }
  return null;
}

/** List / toggle / add (preset + expression) / remove factors; persisted by parent. */
export const FactorManager: React.FC<Props> = ({ factors, onChange, theme }) => {
  const [presetFn, setPresetFn] = useState(FACTOR_CATALOG[0].fn);
  const [exprName, setExprName] = useState("");
  const [expr, setExpr] = useState("");
  const [exprError, setExprError] = useState<string | null>(null);

  const addPreset = () => {
    const cat = FACTOR_CATALOG.find((c) => c.fn === presetFn)!;
    const fd: FactorDef = {
      id: newId(cat.fn, factors),
      name: `${cat.name} ${new Date().toLocaleTimeString()}`,
      kind: "preset",
      fn: cat.fn,
      params: { ...cat.defaultParams },
      enabled: true,
    };
    onChange([...factors, fd]);
  };

  const addExpr = () => {
    const err = validateExpr(expr);
    setExprError(err);
    if (err) return;
    const fd: FactorDef = {
      id: newId("alpha", factors),
      name: exprName.trim() || `表达式 ${factors.length + 1}`,
      kind: "expr",
      expr: expr.trim(),
      enabled: true,
    };
    onChange([...factors, fd]);
    setExpr("");
    setExprName("");
  };

  const update = (id: string, patch: Partial<FactorDef>) => {
    onChange(factors.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const remove = (id: string) => {
    onChange(factors.filter((f) => f.id !== id));
  };

  return (
    <Panel
      title={`因子配置 (${factors.filter((f) => f.enabled !== false).length} 启用 / ${factors.length} 总)`}
      theme={theme}
    >
      <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
        {factors.length === 0 && <span className="text-xs text-gray-500">暂无因子 — 使用下方目录或表达式添加</span>}
        {factors.map((f) => (
          <div key={f.id} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={f.enabled !== false}
              onChange={(e) => update(f.id, { enabled: e.target.checked })}
              className="accent-[#2962ff]"
            />
            <span className="font-mono font-semibold flex-1 truncate" title={f.id}>
              {f.name}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${theme === "dark" ? "bg-[#2a2e39] text-[#d1d4dc]" : "bg-[#f0f3fa] text-[#606470]"}`}>
              {f.kind === "preset" ? f.fn : f.expr}
            </span>
            <button
              onClick={() => remove(f.id)}
              className="text-[#f23645] hover:underline"
              title="删除因子"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t pt-2 border-gray-500/20">
        <select value={presetFn} onChange={(e) => setPresetFn(e.target.value)} className={selectCls(theme)}>
          {FACTOR_CATALOG.map((c) => (
            <option key={c.fn} value={c.fn}>
              {c.name} ({c.fn})
            </option>
          ))}
        </select>
        <button onClick={addPreset} className={btnCls(theme, "ghost")}>
          + 添加预设
        </button>
      </div>

      <div className="flex flex-col gap-1.5 border-t pt-2 border-gray-500/20">
        <div className="flex flex-wrap items-end gap-2">
          <input
            placeholder="因子名称(可选)"
            value={exprName}
            onChange={(e) => setExprName(e.target.value)}
            className={`${inputCls(theme)} w-40`}
          />
          <input
            placeholder="表达式, 如 log(close / sma(close, 20))"
            value={expr}
            onChange={(e) => {
              setExpr(e.target.value);
              setExprError(null);
            }}
            className={`${inputCls(theme)} flex-1 min-w-52`}
          />
          <button onClick={addExpr} className={btnCls(theme, "ghost")}>
            + 添加表达式
          </button>
        </div>
        <span className="text-[11px] text-gray-500">可用函数: sma/ema/std/pct/rsi/max/min/shift/log/abs/atr/vol_ratio · 列: open/high/low/close/volume 及指标列</span>
        {exprError && <span className="text-xs text-[#f23645]">✕ {exprError}</span>}
      </div>
    </Panel>
  );
};
