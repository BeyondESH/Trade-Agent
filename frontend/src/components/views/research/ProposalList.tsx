import { AlertTriangle, Inbox, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import type React from "react";
import type { ProposalAction, ProposalMeta } from "../../../api/types";
import { t } from "../../../lib/i18n";
import type { ThemeMode } from "../../../types/trading";

export const ACTION_LABELS: Record<ProposalAction, string> = {
  open_long: "开多",
  open_short: "开空",
  close: "平仓",
  flat: "观望",
};

export const ACTION_CLASSES: Record<ProposalAction, string> = {
  open_long: "bg-[#089981]/20 text-[#089981]",
  open_short: "bg-[#f23645]/20 text-[#f23645]",
  close: "bg-[#ff9800]/20 text-[#ff9800]",
  flat: "bg-gray-500/20 text-gray-400",
};

/** Parse an epoch-seconds / epoch-ms / ISO timestamp into milliseconds. */
export function toMillis(value: string | number): number {
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  const numeric = Number(value);
  if (value !== "" && !Number.isNaN(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatTime(value: string | number): string {
  const ms = toMillis(value);
  if (!ms) return "—";
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}

interface Props {
  proposals: ProposalMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  theme: ThemeMode;
}

/** Read-only proposal list with loading / error / empty states. */
export const ProposalList: React.FC<Props> = ({
  proposals,
  selectedId,
  onSelect,
  loading,
  error,
  onRetry,
  theme,
}) => {
  const isDark = theme === "dark";

  if (loading) {
    return (
      <div
        data-testid="research-loading"
        className="flex items-center justify-center gap-2 py-10 text-xs text-gray-500"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t("Loading...")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="research-error"
        className="flex flex-col items-center gap-3 py-10 px-4 text-center"
      >
        <AlertTriangle className="w-5 h-5 text-[#f23645]" />
        <div className="text-xs text-[#f23645]">
          {t("Research feed unavailable")}: {error}
        </div>
        <button
          type="button"
          data-testid="research-retry"
          onClick={onRetry}
          className="px-3 py-1 rounded bg-[#2962ff] text-white text-xs font-semibold hover:bg-[#1e53e5]"
        >
          {t("Retry")}
        </button>
      </div>
    );
  }

  if (proposals.length === 0) {
    return (
      <div
        data-testid="research-empty"
        className="flex flex-col items-center gap-2 py-10 text-xs text-gray-500"
      >
        <Inbox className="w-5 h-5" />
        <span>{t("No proposals")}</span>
      </div>
    );
  }

  return (
    <ul data-testid="proposal-list" className="flex flex-col gap-2">
      {proposals.map((p) => {
        const active = p.proposal_id === selectedId;
        const isLong = p.action === "open_long";
        const isShort = p.action === "open_short";
        return (
          <li key={p.proposal_id}>
            <button
              type="button"
              data-testid={`proposal-${p.proposal_id}`}
              onClick={() => onSelect(p.proposal_id)}
              className={`w-full text-left rounded-lg border p-3 flex flex-col gap-1.5 transition-colors ${
                active
                  ? "border-[#2962ff] bg-[#2962ff]/10"
                  : isDark
                    ? "bg-[#1e222d] border-[#2a2e39] hover:border-[#2962ff]"
                    : "bg-white border-[#e0e3eb] hover:border-[#2962ff]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold font-mono text-xs">{p.symbol}</span>
                <span
                  data-testid={`proposal-action-${p.proposal_id}`}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${ACTION_CLASSES[p.action]}`}
                >
                  {isLong ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : isShort ? (
                    <TrendingDown className="w-3 h-3" />
                  ) : null}
                  {ACTION_LABELS[p.action]}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-400">
                <span className="font-mono">{p.timeframe}</span>
                <span>
                  {t("Confidence")}: {Math.round(p.confidence * 100)}%
                </span>
              </div>
              <div className="text-[10px] text-gray-500">{formatTime(p.produced_at)}</div>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
