import React, { useEffect, useState } from "react";
import { ThemeMode } from "../../../types/trading";
import type { AppConfig } from "../../../api/types";
import { api } from "../../../api/client";
import { Panel, Field, btnCls, inputCls, selectCls } from "./ui";

interface Props {
  theme: ThemeMode;
}

const NUM_FIELDS: Array<[keyof AppConfig["provider"] & string, string]> = [
  ["near_pct", "near_pct"],
  ["min_strength", "min_strength"],
  ["leverage", "leverage"],
];

const RISK_FIELDS: Array<[keyof AppConfig["risk"] & string, string]> = [
  ["margin_pct", "margin_pct"],
  ["max_drawdown_pct", "max_drawdown_pct"],
  ["max_leverage", "max_leverage"],
  ["max_adds", "max_adds"],
  ["max_symbol_margin_pct", "max_symbol_margin_pct"],
];

/** Editable provider / risk / system_prompt / manual_rules bound to /config. */
export const AgentConfigPanel: React.FC<Props> = ({ theme }) => {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .getConfig()
      .then(setCfg)
      .catch((e) => setStatus({ ok: false, msg: String(e) }));
  }, []);

  const save = async () => {
    if (!cfg) return;
    setLoading(true);
    setStatus(null);
    try {
      const saved = await api.putConfig(cfg);
      setCfg(saved);
      setStatus({ ok: true, msg: "配置已保存" });
    } catch (e) {
      setStatus({ ok: false, msg: `保存失败: ${e}` });
    } finally {
      setLoading(false);
    }
  };

  if (!cfg) {
    return (
      <Panel title="Agent 配置" theme={theme}>
        <span className="text-xs text-gray-500">加载配置中...</span>
      </Panel>
    );
  }

  return (
    <Panel
      title="Agent 配置"
      theme={theme}
      right={
        <button onClick={save} disabled={loading} className={btnCls(theme)}>
          {loading ? "保存中..." : "保存配置"}
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-gray-400">Provider</span>
          <Field label="kind">
            <select
              value={cfg.provider.kind}
              onChange={(e) => setCfg({ ...cfg, provider: { ...cfg.provider, kind: e.target.value } })}
              className={selectCls(theme)}
            >
              <option value="rule">rule</option>
              <option value="ollama">ollama</option>
              <option value="openai">openai</option>
            </select>
          </Field>
          <Field label="model">
            <input
              value={cfg.provider.model}
              onChange={(e) => setCfg({ ...cfg, provider: { ...cfg.provider, model: e.target.value } })}
              className={inputCls(theme)}
            />
          </Field>
          <Field label="base_url">
            <input
              value={cfg.provider.base_url}
              onChange={(e) => setCfg({ ...cfg, provider: { ...cfg.provider, base_url: e.target.value } })}
              className={inputCls(theme)}
            />
          </Field>
          {NUM_FIELDS.map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                type="number"
                step="any"
                value={cfg.provider[key] as number}
                onChange={(e) =>
                  setCfg({ ...cfg, provider: { ...cfg.provider, [key]: Number(e.target.value) } })
                }
                className={inputCls(theme)}
              />
            </Field>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-gray-400">风控</span>
          {RISK_FIELDS.map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                type="number"
                step="any"
                value={cfg.risk[key] as number}
                onChange={(e) => setCfg({ ...cfg, risk: { ...cfg.risk, [key]: Number(e.target.value) } })}
                className={inputCls(theme)}
              />
            </Field>
          ))}
          <span className="text-xs font-bold text-gray-400 mt-2">规则</span>
          <Field label="system_prompt">
            <textarea
              rows={4}
              value={cfg.system_prompt ?? ""}
              onChange={(e) => setCfg({ ...cfg, system_prompt: e.target.value })}
              className={`${inputCls(theme)} font-mono text-xs`}
            />
          </Field>
          <Field label="manual_rules (每行一条)">
            <textarea
              rows={3}
              value={(cfg.manual_rules ?? []).join("\n")}
              onChange={(e) =>
                setCfg({ ...cfg, manual_rules: e.target.value.split("\n").filter((l) => l.trim()) })
              }
              className={`${inputCls(theme)} font-mono text-xs`}
            />
          </Field>
        </div>
      </div>
      {status && (
        <span className={`text-xs ${status.ok ? "text-[#089981]" : "text-[#f23645]"}`}>
          {status.ok ? "✓ " : "✕ "}
          {status.msg}
        </span>
      )}
    </Panel>
  );
};
