import { FileText, ShieldCheck } from "lucide-react";
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
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
      <span className="text-xs font-semibold">{children}</span>
    </div>
  );
}

interface Props {
  proposal: StrategyProposal;
  theme: ThemeMode;
}

/** Full read-only proposal detail: every contract field + evidence + provenance. */
export const ProposalDetail: React.FC<Props> = ({ proposal, theme }) => {
  const isDark = theme === "dark";
  const p = proposal;

  return (
    <article
      data-testid="proposal-detail"
      className={`rounded-xl border p-4 flex flex-col gap-4 ${
        isDark ? "bg-[#1e222d] border-[#2a2e39]" : "bg-white border-[#e0e3eb]"
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#2962ff]" />
          <div>
            <div className="font-bold font-mono text-sm">{p.symbol}</div>
            <div className="text-[10px] text-gray-500 font-mono">{p.proposal_id}</div>
          </div>
        </div>
        <span
          data-testid="detail-action"
          className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${ACTION_CLASSES[p.action]}`}
        >
          {ACTION_LABELS[p.action]}
        </span>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label={t("Category")}>{p.category}</Field>
        <Field label={t("Timeframe")}>{p.timeframe}</Field>
        <Field label={t("Confidence")}>{Math.round(p.confidence * 100)}%</Field>
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

      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">{t("Rationale")}</span>
        <p className="text-xs leading-relaxed text-gray-300">{p.rationale}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">{t("Evidence")}</span>
        <ul data-testid="proposal-evidence" className="flex flex-col gap-1">
          {p.evidence.map((item) => (
            <li
              key={item}
              className={`text-[11px] rounded px-2 py-1 border ${
                isDark ? "bg-[#131722] border-[#2a2e39]" : "bg-[#f0f3fa] border-[#e0e3eb]"
              }`}
            >
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div
        data-testid="proposal-provenance"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500 border-t pt-3 border-gray-500/20"
      >
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-[#089981]" />
          {t("Provenance")}
        </span>
        <span>
          {t("Model")}: <span className="font-mono">{p.provenance.model}</span>
        </span>
        <span>
          {t("Prompt Version")}: <span className="font-mono">{p.provenance.prompt_ver}</span>
        </span>
        <span className="truncate" title={p.provenance.research_thread_id}>
          {t("Research Thread")}:{" "}
          <span className="font-mono">{p.provenance.research_thread_id}</span>
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
