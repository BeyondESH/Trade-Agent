import { Eye, FileText, RefreshCw, Search } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type { ProposalMeta, StrategyProposal } from "../../api/types";
import { t } from "../../lib/i18n";
import type { ThemeMode } from "../../types/trading";
import { Skeleton } from "../ui/skeleton";
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
 * Read-only 研报 view: a filterable proposal rail, a full proposal detail
 * (evidence + provenance) and the execution-run SSE timeline. There is no
 * order/mutation affordance anywhere in this view by design.
 */
export const ResearchView: React.FC<{ theme: ThemeMode }> = ({ theme }) => {
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
      className="flex-1 h-full overflow-y-auto overflow-x-hidden bg-ink text-content select-none"
    >
      {/* Sticky command header - the AI layer carries the violet accent */}
      <header className="ta-glass sticky top-0 z-20 border-b border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-research/15 text-research">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h1 className="ta-display truncate text-base tracking-tight text-content">
                {t("Research Reports")}
              </h1>
              <p className="mt-0.5 hidden truncate text-xs text-muted lg:block">
                {t("AI research proposals and the deterministic execution audit trail.")}
              </p>
            </div>
          </div>
          <span
            data-testid="research-readonly-badge"
            className="ta-eyebrow flex shrink-0 items-center gap-1 rounded-md border border-line/70 bg-surface-2 px-2 py-1 text-muted"
          >
            <Eye className="h-3 w-3" />
            {t("Read-only")}
          </span>
        </div>

        {/* Filter bar - the view's only form input */}
        <form
          className="flex flex-wrap items-center gap-2 border-t border-line/60 px-6 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            setSymbol(symbolInput.trim());
          }}
        >
          <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs transition-colors focus-within:border-research/60">
            <Search className="h-3.5 w-3.5 text-muted" />
            <input
              data-testid="research-symbol-filter"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              placeholder={t("Filter by symbol...")}
              className="w-40 bg-transparent outline-none placeholder:text-faint"
            />
          </div>

          <select
            data-testid="research-time-filter"
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-content outline-none transition-colors focus:border-research/60"
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
            className="flex items-center gap-1.5 rounded-md bg-signal px-3 py-1.5 text-xs font-semibold text-signal-ink transition-colors hover:bg-signal/90"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("Refresh")}
          </button>
        </form>
      </header>

      {/* Two-pane: proposal rail + detail */}
      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="min-w-0">
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
              className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-e1"
            >
              <Skeleton className="h-5 w-40" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
              <Skeleton className="h-24" />
            </div>
          ) : detailError ? (
            <div
              data-testid="research-detail-error"
              className="rounded-xl border border-down/30 bg-down/10 px-4 py-10 text-center text-xs text-down"
            >
              {t("Proposal unavailable")}: {detailError}
            </div>
          ) : detail ? (
            <ProposalDetail proposal={detail} theme={theme} />
          ) : (
            <div
              data-testid="research-detail-empty"
              className="flex items-center justify-center rounded-xl border border-dashed border-line bg-surface/40 py-16 text-xs text-muted"
            >
              {t("Select a proposal to view details")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
