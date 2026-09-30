import { AlertTriangle, Inbox, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
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
  open_long: "bg-up/15 text-up",
  open_short: "bg-down/15 text-down",
  close: "bg-signal/15 text-signal",
  flat: "bg-surface-2 text-muted",
};

/** Shared surface recipe for the research rail's panel. */
const PANEL = "flex flex-col rounded-xl border border-line bg-surface shadow-e1";
const SPRING = { type: "spring", stiffness: 380, damping: 30 } as const;

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

/** Read-only proposal rail: a scrollable column of selectable cards. */
export const ProposalList: React.FC<Props> = ({
  proposals,
  selectedId,
  onSelect,
  loading,
  error,
  onRetry,
  theme,
}) => {
  const reduce = useReducedMotion();

  let body: React.ReactNode;
  if (loading) {
    body = (
      <div
        data-testid="research-loading"
        className="flex items-center justify-center gap-2 py-10 text-xs text-muted"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{t("Loading...")}</span>
      </div>
    );
  } else if (error) {
    body = (
      <div
        data-testid="research-error"
        className="flex flex-col items-center gap-3 px-4 py-10 text-center"
      >
        <AlertTriangle className="h-5 w-5 text-down" />
        <div className="text-xs text-down">
          {t("Research feed unavailable")}: {error}
        </div>
        <button
          type="button"
          data-testid="research-retry"
          onClick={onRetry}
          className="rounded-md bg-signal px-3 py-1 text-xs font-semibold text-signal-ink transition-colors hover:bg-signal/90"
        >
          {t("Retry")}
        </button>
      </div>
    );
  } else if (proposals.length === 0) {
    body = (
      <div
        data-testid="research-empty"
        className="flex flex-col items-center gap-2 py-10 text-xs text-muted"
      >
        <Inbox className="h-5 w-5 text-faint" />
        <span>{t("No proposals")}</span>
      </div>
    );
  } else {
    body = (
      <ul
        data-testid="proposal-list"
        className="flex max-h-[70vh] flex-col gap-1.5 overflow-y-auto p-2"
      >
        {proposals.map((p) => {
          const active = p.proposal_id === selectedId;
          const isLong = p.action === "open_long";
          const isShort = p.action === "open_short";
          return (
            <motion.li key={p.proposal_id} whileHover={{ x: 1 }} transition={SPRING}>
              <button
                type="button"
                data-testid={`proposal-${p.proposal_id}`}
                onClick={() => onSelect(p.proposal_id)}
                className={`relative flex w-full flex-col gap-1.5 overflow-hidden rounded-lg border p-2.5 text-left transition-colors ${
                  active
                    ? "border-research/50 bg-research/10"
                    : "border-line bg-surface-2/40 hover:border-research/40 hover:bg-surface-2"
                }`}
              >
                {/* Selection is marked by a single sliding accent bar, not a fill */}
                {active && (
                  <motion.span
                    layoutId="proposal-accent"
                    className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-research"
                    transition={reduce ? { duration: 0 } : SPRING}
                  />
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="ta-display text-xs text-content">{p.symbol}</span>
                  <span
                    data-testid={`proposal-action-${p.proposal_id}`}
                    className={`ta-eyebrow inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${ACTION_CLASSES[p.action]}`}
                  >
                    {isLong ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : isShort ? (
                      <TrendingDown className="h-3 w-3" />
                    ) : null}
                    {ACTION_LABELS[p.action]}
                  </span>
                </div>
                <div className="flex items-center justify-between text-2xs text-muted">
                  <span className="ta-num">{p.timeframe}</span>
                  <span className="ta-num">
                    {t("Confidence")}: {Math.round(p.confidence * 100)}%
                  </span>
                </div>
                <div className="ta-num text-2xs text-faint">{formatTime(p.produced_at)}</div>
              </button>
            </motion.li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className={`${PANEL} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-line/70 px-3.5 py-2.5">
        <span className="ta-eyebrow text-faint">{t("Research Reports")}</span>
        <span className="ta-num text-2xs text-faint">{proposals.length}</span>
      </div>
      {body}
    </section>
  );
};
