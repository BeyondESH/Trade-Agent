import { FileText, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type React from "react";
import type { StrategyProposal } from "../../../api/types";
import { t } from "../../../lib/i18n";
import type { ThemeMode } from "../../../types/trading";
import { ExecutionTimeline, executionThreadId } from "./ExecutionTimeline";
import { ACTION_CLASSES, ACTION_LABELS, toMillis } from "./ProposalList";

const ENTRY_LABELS: Record<string, string> = {
  market: "市价",
  limit: "限价",
};

function formatTime(value: string | number | undefined): string {
  if (value === undefined) return "—";
  const ms = toMillis(value);
  return ms ? new Date(ms).toLocaleString("zh-CN", { hour12: false }) : "—";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-line/60 bg-surface-2/40 px-2.5 py-2">
      <span className="ta-eyebrow text-faint">{label}</span>
      <span className="ta-num text-xs font-semibold text-content">{children}</span>
    </div>
  );
}

interface Props {
  proposal: StrategyProposal;
  theme: ThemeMode;
}

/** Full read-only proposal detail: every contract field + evidence + provenance. */
export const ProposalDetail: React.FC<Props> = ({ proposal, theme }) => {
  const p = proposal;
  const reduce = useReducedMotion();
  const confidencePct = Math.round(p.confidence * 100);

  return (
    <article
      data-testid="proposal-detail"
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 shadow-e1"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-research/15 text-research">
            <FileText className="h-4 w-4" />
          </span>
          <div>
            <div className="ta-display text-sm text-content">{p.symbol}</div>
            <div className="ta-num text-2xs text-faint">{p.proposal_id}</div>
          </div>
        </div>
        <span
          data-testid="detail-action"
          className={`ta-eyebrow rounded px-2 py-1 ${ACTION_CLASSES[p.action]}`}
        >
          {ACTION_LABELS[p.action]}
        </span>
      </header>

      {/* Confidence meter: the one bar that matters, in the research accent */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="ta-eyebrow text-faint">{t("Confidence")}</span>
          <span className="ta-num text-xs font-semibold text-research">{confidencePct}%</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className="h-full rounded-full bg-research"
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${confidencePct}%` }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 32 }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label={t("Category")}>{p.category}</Field>
        <Field label={t("Timeframe")}>{p.timeframe}</Field>
        <Field label={t("Entry")}>
          {ENTRY_LABELS[p.entry.kind] ?? p.entry.kind}
          {p.entry.price !== undefined ? ` @ ${p.entry.price}` : ""}
        </Field>
        <Field label={t("Stop Loss")}>{p.stop_loss ?? "—"}</Field>
        <Field label={t("Take Profit")}>{p.take_profit ?? "—"}</Field>
        <Field label={t("Horizon")}>{p.horizon}</Field>
        <Field label={t("Produced")}>{formatTime(p.produced_at)}</Field>
        <Field label={t("Expires")}>{formatTime(p.expires_at)}</Field>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="ta-eyebrow text-faint">{t("Rationale")}</span>
        <p className="text-xs leading-relaxed text-content/90">{p.rationale}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="ta-eyebrow text-faint">{t("Evidence")}</span>
        <ul data-testid="proposal-evidence" className="flex flex-wrap gap-1.5">
          {p.evidence.map((item) => (
            <li
              key={item}
              className="max-w-full truncate rounded-md border border-line bg-surface-2 px-2 py-1 text-2xs text-muted"
              title={item}
            >
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div
        data-testid="proposal-provenance"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line/60 pt-3 text-2xs text-faint"
      >
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-up" />
          {t("Provenance")}
        </span>
        <span>
          {t("Model")}: <span className="ta-num text-muted">{p.provenance.model}</span>
        </span>
        <span>
          {t("Prompt Version")}:{" "}
          <span className="ta-num text-muted">{p.provenance.prompt_ver}</span>
        </span>
        <span className="truncate" title={p.provenance.research_thread_id}>
          {t("Research Thread")}:{" "}
          <span className="ta-num text-muted">{p.provenance.research_thread_id}</span>
        </span>
      </div>

      <ExecutionTimeline
        threadId={executionThreadId(p.proposal_id)}
        runId={p.proposal_id}
        theme={theme}
      />
    </article>
  );
};
