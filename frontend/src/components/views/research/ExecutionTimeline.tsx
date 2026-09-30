import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, Radio } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import type { ExecutionNodeEvent, ResearchStreamEvent } from "../../../api/types";
import { t } from "../../../lib/i18n";
import type { ThemeMode } from "../../../types/trading";

type StreamState = "connecting" | "open" | "closed";

export interface TimelineEntry {
  kind: "node" | "text";
  label: string;
  detail?: string;
}

export interface TimelineTerminal {
  failed: boolean;
  status: string;
  reason?: string;
}

const FAILURE_STATUSES = new Set(["failed", "fail_closed", "error"]);
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "fail_closed"]);

/** A status is terminal once the run can no longer emit further nodes. */
export function isTerminalStatus(status?: string): boolean {
  return !!status && TERMINAL_STATUSES.has(status.toLowerCase());
}

/** A terminal status that aborted the run (as opposed to a paper fill). */
export function isFailureStatus(status?: string): boolean {
  return !!status && FAILURE_STATUSES.has(status.toLowerCase());
}

/**
 * LangGraph thread id of the deterministic execution graph for a proposal.
 * Mirrors the backend design: `thread_id = exec:<proposal_id>`.
 */
export function executionThreadId(proposalId: string): string {
  return `exec:${proposalId}`;
}

function nodeEntry(event: ExecutionNodeEvent): TimelineEntry {
  return { kind: "node", label: event.node, detail: event.detail };
}

interface Props {
  /** Streamed via `GET /research/{thread_id}/stream`. */
  threadId: string;
  /** Optional `GET /executions/{run_id}` seed for node history / terminal state. */
  runId?: string;
  theme: ThemeMode;
}

/**
 * Read-only timeline for one execution run: appends `node` frames from the SSE
 * stream and surfaces the terminal state. A fail-closed terminal always renders
 * its reason (never a bare empty box).
 */
export const ExecutionTimeline: React.FC<Props> = ({ threadId, runId, theme }) => {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [state, setState] = useState<StreamState>("connecting");
  const [terminal, setTerminal] = useState<TimelineTerminal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setEntries([]);
    setTerminal(null);
    setError(null);
    setState("connecting");

    // Best-effort seed from the run projection; the SSE stream stays the source
    // of truth, so a missing/404 projection must not break the timeline.
    if (runId) {
      api
        .executionRun(runId)
        .then((run) => {
          if (!alive) return;
          if (Array.isArray(run.nodes) && run.nodes.length > 0) {
            setEntries(run.nodes.map(nodeEntry));
          }
          if (isTerminalStatus(run.status)) {
            setTerminal({
              failed: isFailureStatus(run.status),
              status: run.status,
              reason: run.reason ?? undefined,
            });
          }
        })
        .catch(() => {
          /* projection not available yet — the stream still carries the run */
        });
    }

    const handle = api.openResearchStream(threadId, {
      onOpen: () => {
        if (alive) setState("open");
      },
      onError: () => {
        if (!alive) return;
        setState("closed");
        setError(t("Execution stream disconnected"));
      },
      onEvent: (event: ResearchStreamEvent) => {
        if (!alive) return;
        switch (event.type) {
          case "node":
            setEntries((prev) => [
              ...prev,
              { kind: "node", label: event.node, detail: event.detail },
            ]);
            break;
          case "text":
            setEntries((prev) => [...prev, { kind: "text", label: event.text }]);
            break;
          case "done":
            setTerminal({
              failed: isFailureStatus(event.status),
              status: event.status ?? "succeeded",
              reason: event.reason,
            });
            setState("closed");
            break;
          case "error":
            setTerminal({
              failed: true,
              status: "fail_closed",
              reason: event.reason ?? event.message,
            });
            setState("closed");
            break;
        }
      },
    });

    return () => {
      alive = false;
      handle.close();
    };
  }, [threadId, runId]);

  const stateLabel =
    state === "open" ? t("Live") : state === "connecting" ? t("Connecting...") : t("Closed");

  return (
    <section
      data-testid="execution-timeline"
      className="ta-well flex flex-col gap-3 rounded-xl border border-line p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-research" />
          <h3 className="ta-display text-sm text-content">{t("Execution Timeline")}</h3>
        </div>
        <span
          data-testid="timeline-stream-state"
          className={`ta-num rounded px-2 py-0.5 text-2xs font-semibold ${
            state === "open"
              ? "bg-up/15 text-up"
              : state === "connecting"
                ? "bg-research/15 text-research"
                : "bg-surface-2 text-muted"
          }`}
        >
          {stateLabel}
        </span>
      </header>

      <div className="ta-num truncate text-2xs text-faint" title={threadId}>
        {threadId}
      </div>

      {error && (
        <div
          data-testid="timeline-error"
          className="flex items-center gap-2 rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-xs text-down"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{error}</span>
        </div>
      )}

      {entries.length === 0 && !terminal && !error ? (
        <div
          data-testid="timeline-empty"
          className="flex items-center justify-center gap-2 py-4 text-xs text-muted"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{t("Waiting for events...")}</span>
        </div>
      ) : (
        /* Vertical timeline: one connector line, a node dot per event */
        <ol data-testid="timeline-events" className="relative flex flex-col gap-3">
          <span
            aria-hidden="true"
            className="absolute left-[5px] top-1 bottom-1 w-px bg-line-strong"
          />
          {entries.map((entry, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only ordered log
              key={`${entry.kind}-${i}`}
              data-testid={`timeline-event-${i}`}
              className="relative pl-6"
            >
              <span
                aria-hidden="true"
                className={`absolute left-0 top-1 h-2.5 w-2.5 rounded-full ${
                  entry.kind === "node" ? "bg-research" : "border border-faint bg-surface"
                }`}
              />
              <div className="flex items-center gap-1.5">
                {entry.kind === "node" ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-research" />
                ) : (
                  <CircleDashed className="h-3 w-3 shrink-0 text-muted" />
                )}
                <div className="text-xs font-semibold text-content">{entry.label}</div>
              </div>
              {entry.detail && (
                <div className="mt-0.5 break-words text-2xs text-muted">{entry.detail}</div>
              )}
            </li>
          ))}
        </ol>
      )}

      {terminal && (
        <div
          data-testid={terminal.failed ? "timeline-terminal-failed" : "timeline-terminal-success"}
          className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs ${
            terminal.failed
              ? "border-down/30 bg-down/10 text-down"
              : "border-up/30 bg-up/10 text-up"
          }`}
        >
          <div className="ta-eyebrow flex items-center gap-2">
            {terminal.failed ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            <span>
              {terminal.status === "succeeded"
                ? t("Execution succeeded")
                : terminal.status === "fail_closed"
                  ? t("Fail-closed")
                  : t("Execution failed")}
            </span>
          </div>
          {terminal.failed && (
            <div data-testid="timeline-fail-reason" className="break-words">
              <span className="font-semibold">{t("Reason")}: </span>
              {terminal.reason ?? t("Unknown reason")}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
