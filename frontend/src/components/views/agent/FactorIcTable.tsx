import React, { useCallback, useState } from "react";
import { ThemeMode } from "../../../types/trading";
import type { DlFeaturesResponse, DataWindow, FactorDef, FactorIc, SeriesRef } from "../../../api/types";
import { api } from "../../../api/client";
import { Panel, btnCls, fmtNum } from "./ui";
import { FactorIcChart } from "./FactorIcChart";

type SortKey = "ic_abs" | "ic" | "coverage" | "id";
type SortDir = "asc" | "desc";

interface Props {
  series: SeriesRef;
  factors: FactorDef[];
  range?: DataWindow;
  theme: ThemeMode;
}

/** Runs /dl/features and renders a sortable IC table. */
export const FactorIcTable: React.FC<Props> = ({ series, factors, range, theme }) => {
  const [data, setData] = useState<DlFeaturesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("ic_abs");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const analyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const enabled = factors.filter((f) => f.enabled !== false);
      const res = await api.dlFeatures(series, enabled.length > 0 ? enabled : undefined, range?.start, range?.end);
      setData(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [series, factors, range]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const rows: FactorIc[] = data
    ? [...data.factors].sort((a, b) => {
        const av = a[sortKey] ?? (sortKey === "id" ? "" : -Infinity);
        const bv = b[sortKey] ?? (sortKey === "id" ? "" : -Infinity);
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      })
    : [];

  const SortHeader: React.FC<{ k: SortKey; label: string }> = ({ k, label }) => (
    <th
      className="px-2 py-1 text-left font-semibold text-[11px] cursor-pointer select-none"
      onClick={() => toggleSort(k)}
    >
      {label}
      {sortKey === k && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );

  return (
    <Panel
      title="因子 IC 分析"
      theme={theme}
      right={
        <button onClick={analyze} disabled={loading} className={btnCls(theme, "ghost")}>
          {loading ? "分析中..." : data ? "重新分析" : "分析因子 IC"}
        </button>
      }
    >
      {error && <span className="text-xs text-[#f23645]">✕ {error}</span>}
      {data && (
        <div className="flex flex-wrap gap-3 text-[11px] text-gray-400 font-mono">
          <span>有效行: {data.n_rows.toLocaleString()}</span>
          <span>因子数: {data.factors.length}</span>
        </div>
      )}
      <FactorIcChart factors={data?.factors ?? []} theme={theme} />
      {rows.length === 0 && !loading && <span className="text-xs text-gray-500">点击「分析因子 IC」查看各因子预测力。</span>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className={`w-full text-xs ${theme === "dark" ? "text-[#d1d4dc]" : "text-[#131722]"}`}>
            <thead>
              <tr className={`border-b ${theme === "dark" ? "border-[#2a2e39]" : "border-[#e0e3eb]"}`}>
                <SortHeader k="id" label="因子" />
                <SortHeader k="ic" label="IC" />
                <SortHeader k="ic_abs" label="|IC|" />
                <SortHeader k="coverage" label="覆盖率" />
                <th className="px-2 py-1 text-left font-semibold text-[11px]">均值</th>
                <th className="px-2 py-1 text-left font-semibold text-[11px]">末值</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className={`border-b ${theme === "dark" ? "border-[#2a2e39]/60" : "border-[#e0e3eb]/60"}`}>
                  <td className="px-2 py-1 font-mono">{f.id}</td>
                  <td className="px-2 py-1 font-mono">{f.ic != null ? f.ic.toFixed(4) : "—"}</td>
                  <td className="px-2 py-1 font-mono">{f.ic_abs != null ? f.ic_abs.toFixed(4) : "—"}</td>
                  <td className="px-2 py-1 font-mono">{fmtNum(f.coverage * 100, 1)}%</td>
                  <td className="px-2 py-1 font-mono">{f.mean != null ? f.mean.toFixed(4) : "—"}</td>
                  <td className="px-2 py-1 font-mono">{f.last_value != null ? f.last_value.toFixed(4) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};
