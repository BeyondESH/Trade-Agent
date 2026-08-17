import { useState } from "react";
import { api } from "../../api/client";
import { useI18n } from "../../lib/i18n";

interface Props {
  symbol: string;
  timeframe: string;
}

const CATEGORY = "USDT-FUTURES";

function jobValue(job: Record<string, unknown>, key: string): string {
  const v = job[key];
  if (v == null) return "--";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "--";
  return String(v);
}

/** Bottom dock backtest tab — runs POST /backtest and polls /jobs/{id}. */
export function BacktestPanel({ symbol, timeframe }: Props) {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");

  const run = async () => {
    setRunning(true);
    setErr("");
    setResult(null);
    try {
      const { job_id } = await api.backtest({ category: CATEGORY, symbol, timeframe });
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const job = await api.job(job_id);
        const status = String(job.status ?? job.state ?? "");
        if (status === "done" || status === "success" || status === "completed") {
          setResult(job);
          return;
        }
        if (status === "error" || status === "failed") {
          setErr(jobValue(job, "error") !== "--" ? jobValue(job, "error") : status);
          return;
        }
      }
      setErr("timeout");
    } catch (e) {
      setErr(String(e));
    } finally {
      setRunning(false);
    }
  };

  const summaryKeys = ["total_return", "win_rate", "trade_count", "max_drawdown", "sharpe"];

  return (
    <div className="flex h-full min-h-0 flex-col bg-base" data-testid="backtest-panel">
      <div className="flex items-center gap-3 border-b border-border px-3 py-1.5">
        <span className="text-xs font-semibold text-text">
          {symbol} · {timeframe}
        </span>
        <button
          onClick={run}
          disabled={running}
          className="rounded-btn bg-accent px-3 py-1 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
          data-testid="backtest-run"
        >
          {running ? t("backtest.running") : t("backtest.run")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {err && <div className="text-xs text-down">{t("backtest.error")}: {err}</div>}
        {!err && !result && <div className="text-xs text-muted">—</div>}
        {result && (
          <div className="flex flex-col gap-1 text-xs tnum">
            <div className="mb-1 font-semibold text-text">{t("backtest.result")}</div>
            {summaryKeys.map((k) => (
              <div key={k} className="flex justify-between">
                <span className="text-muted">{k}</span>
                <span className="text-text">{jobValue(result, k)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
