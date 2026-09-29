import { Eye, FileText, Loader2, RefreshCw, Search } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { ProposalMeta, StrategyProposal } from "../../api/types";
import { t } from "../../lib/i18n";
import type { ThemeMode } from "../../types/trading";
import { ProposalDetail } from "./research/ProposalDetail";
import { ProposalList, toMillis } from "./research/ProposalList";

type RangeKey = "all" | "24h" | "7d" | "30d";

const RANGE_MS: Record<Exclude<RangeKey, "all">, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
];

const PROPOSAL_LIMIT = 100;

/**
 * Read-only 研报 view: a filterable proposal list, a full proposal detail
 * (evidence + provenance) and the execution-run SSE timeline. There is no
 * order/mutation affordance anywhere in this view by design.
 */
export const ResearchView: React.FC<{ theme: ThemeMode }> = ({ theme }) => {
  const isDark = theme === "dark";

  const [proposals, setProposals] = useState<ProposalMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [symbolInput, setSymbolInput] = useState("");
  const [symbol, setSymbol] = useState("");
  const [range, setRange] = useState<RangeKey>("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StrategyProposal | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.researchProposals({
        symbol: symbol || undefined,
        limit: PROPOSAL_LIMIT,
      });
      setProposals(res.proposals ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    setDetailError(null);
    api
      .researchProposal(selectedId)
      .then((p) => {
        if (alive) setDetail(p);
      })
      .catch((e) => {
        if (alive) {
          setDetail(null);
          setDetailError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const visible = useMemo(() => {
    if (range === "all") return proposals;
    const cutoff = Date.now() - RANGE_MS[range];
    return proposals.filter((p) => toMillis(p.produced_at) >= cutoff);
  }, [proposals, range]);

  return (
    <div
      id="research-view"
      data-testid="research-view"
      className={`flex-1 h-full overflow-y-auto p-4 select-none font-sans flex flex-col ${
        isDark ? "bg-[#131722] text-[#d1d4dc]" : "bg-[#f0f3fa] text-[#131722]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#2962ff]" />
            <span>{t("Research Reports")}</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {t("AI research proposals and the deterministic execution audit trail.")}
          </p>
        </div>
        <span
          data-testid="research-readonly-badge"
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-gray-500/15 text-gray-400"
        >
          <Eye className="w-3 h-3" />
          {t("Read-only")}
        </span>
      </div>

      {/* Filters */}
      <form
        className="flex items-center gap-2 flex-wrap mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSymbol(symbolInput.trim());
        }}
      >
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
            isDark ? "bg-[#1e222d] border-[#2a2e39]" : "bg-white border-[#e0e3eb]"
          }`}
        >
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input
            data-testid="research-symbol-filter"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder={t("Filter by symbol...")}
            className="bg-transparent outline-none w-40 placeholder:text-gray-500"
          />
        </div>

        <select
          data-testid="research-time-filter"
          value={range}
          onChange={(e) => setRange(e.target.value as RangeKey)}
          className={`px-3 py-1.5 rounded-lg border text-xs ${
            isDark ? "bg-[#1e222d] border-[#2a2e39]" : "bg-white border-[#e0e3eb]"
          }`}
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.label)}
            </option>
          ))}
        </select>

        <button
          type="button"
          data-testid="research-refresh"
          onClick={() => void load()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2962ff] text-white text-xs font-semibold hover:bg-[#1e53e5]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t("Refresh")}
        </button>
      </form>

      {/* List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-4 flex-1 min-h-0">
        <div className="min-h-0">
          <ProposalList
            proposals={visible}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loading}
            error={error}
            onRetry={() => void load()}
            theme={theme}
          />
        </div>

        <div className="min-w-0">
          {detailLoading ? (
            <div
              data-testid="research-detail-loading"
              className="flex items-center justify-center gap-2 py-10 text-xs text-gray-500"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t("Loading...")}</span>
            </div>
          ) : detailError ? (
            <div
              data-testid="research-detail-error"
              className="py-10 text-center text-xs text-[#f23645]"
            >
              {t("Proposal unavailable")}: {detailError}
            </div>
          ) : detail ? (
            <ProposalDetail proposal={detail} theme={theme} />
          ) : (
            <div
              data-testid="research-detail-empty"
              className="flex items-center justify-center py-10 text-xs text-gray-500"
            >
              {t("Select a proposal to view details")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
