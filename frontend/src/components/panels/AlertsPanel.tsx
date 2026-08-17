import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../lib/i18n";
import {
  createAlert,
  evalAlert,
  loadAlerts,
  mirrorAlertCreate,
  mirrorAlertDelete,
  mirrorAlertUpdate,
  saveAlerts,
  syncAlertsFromServer,
  type Alert,
  type AlertCondition,
} from "../../lib/alertsStore";

interface Props {
  /** `category:instId` composite keys (bare instIds still accepted for legacy data). */
  symbols: string[];
  /** live prices keyed by bare instId */
  priceMap: Record<string, number | undefined>;
  defaultSymbol: string;
  /** Prefilled from the chart context menu ("create alert at price"). */
  prefill?: { symbol: string; threshold: number } | null;
  /** Fired when an alert transitions to triggered (toasts/notifications). */
  onTrigger?: (alert: Alert) => void;
}

/** Bare instId part of a possibly composite `category:instId` symbol key. */
export function instOf(symbol: string): string {
  const idx = symbol.indexOf(":");
  return idx >= 0 ? symbol.slice(idx + 1) : symbol;
}

/** Right sidebar Alerts tab — server-persisted price alerts with local fallback. */
export function AlertsPanel({ symbols, priceMap, defaultSymbol, prefill, onTrigger }: Props) {
  const { t } = useI18n();
  const [alerts, setAlerts] = useState<Alert[]>(loadAlerts);
  const [symbol, setSymbol] = useState(prefill?.symbol ?? defaultSymbol);
  const [condition, setCondition] = useState<AlertCondition>("above");
  const [threshold, setThreshold] = useState(prefill?.threshold != null ? String(prefill.threshold) : "");

  // Pull the server list once (cross-device); silently keeps local on failure.
  useEffect(() => {
    let alive = true;
    void syncAlertsFromServer().then((merged) => {
      if (alive && merged) setAlerts(merged);
    });
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback((next: Alert[]) => {
    setAlerts(next);
    saveAlerts(next);
  }, []);

  // evaluate triggers whenever live prices tick
  useEffect(() => {
    let changed = false;
    const next = alerts.map((a) => {
      const p = priceMap[instOf(a.symbol)];
      if (p == null || a.triggered) return a;
      if (evalAlert(a, p)) {
        changed = true;
        onTrigger?.(a);
        return { ...a, triggered: true };
      }
      return a;
    });
    if (changed) {
      persist(next);
      for (const a of next) {
        if (a.triggered && !alerts.find((x) => x.id === a.id)?.triggered) {
          mirrorAlertUpdate(a.id, { triggered: true });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts, priceMap, persist]);

  const add = () => {
    const v = Number(threshold);
    if (!symbol || !Number.isFinite(v) || v <= 0) return;
    const alert = createAlert({ symbol, condition, threshold: v, enabled: true });
    persist([alert, ...alerts]);
    mirrorAlertCreate(alert);
    setThreshold("");
  };

  const options = symbols.includes(defaultSymbol) ? symbols : [defaultSymbol, ...symbols];

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="alerts-panel">
      <div className="flex flex-col gap-1.5 border-b border-border p-2">
        <div className="flex gap-1.5">
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="w-28 shrink-0 rounded-btn border border-border bg-base px-1.5 py-1 text-xs text-text outline-none focus:border-accent"
            data-testid="alert-symbol"
          >
            {options.map((s) => (
              <option key={s} value={s}>
                {instOf(s)}
              </option>
            ))}
          </select>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as AlertCondition)}
            className="rounded-btn border border-border bg-base px-1.5 py-1 text-xs text-text outline-none focus:border-accent"
            data-testid="alert-condition"
          >
            <option value="above">{t("alerts.above")}</option>
            <option value="below">{t("alerts.below")}</option>
          </select>
          <input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder={t("alerts.threshold")}
            className="min-w-0 flex-1 rounded-btn border border-border bg-base px-2 py-1 text-xs text-text tnum outline-none focus:border-accent"
            data-testid="alert-threshold"
          />
          <button
            onClick={add}
            className="shrink-0 rounded-btn bg-accent px-2 py-1 text-xs font-semibold text-white hover:brightness-110"
            data-testid="alert-add"
          >
            {t("alerts.create")}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {alerts.length === 0 && (
          <div className="p-4 text-center text-xs text-muted">{t("alerts.hint")}</div>
        )}
        {alerts.map((a) => {
          const price = priceMap[instOf(a.symbol)];
          return (
            <div
              key={a.id}
              className={`flex items-center gap-2 border-b border-borderSoft px-2 py-1.5 text-xs ${
                a.triggered ? "bg-accent/10" : ""
              }`}
              data-testid={`alert-${a.id}`}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold">{a.symbol}</span>
                  <span className="text-muted">
                    {t(a.condition === "above" ? "alerts.above" : "alerts.below")} {a.threshold}
                  </span>
                </div>
                <div className="tnum text-muted">
                  {a.triggered ? (
                    <span className="text-accent">{t("alerts.triggered")}</span>
                  ) : (
                    <>
                      {t("alerts.enabled")}: {a.enabled ? "✓" : "✗"}
                      {price != null && ` · ${price}`}
                    </>
                  )}
                </div>
              </div>
              <label className="flex items-center gap-1 text-muted">
                <input
                  type="checkbox"
                  checked={a.enabled}
                  onChange={() => {
                    persist(alerts.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x)));
                    mirrorAlertUpdate(a.id, { enabled: !a.enabled });
                  }}
                  className="accent-accent"
                />
              </label>
              {a.triggered && (
                <button
                  onClick={() => {
                    persist(alerts.map((x) => (x.id === a.id ? { ...x, triggered: false } : x)));
                    mirrorAlertUpdate(a.id, { triggered: false });
                  }}
                  className="rounded-btn px-1.5 py-0.5 text-muted hover:bg-hover hover:text-text"
                >
                  {t("alerts.reset")}
                </button>
              )}
              <button
                onClick={() => {
                  persist(alerts.filter((x) => x.id !== a.id));
                  mirrorAlertDelete(a.id);
                }}
                className="rounded-btn px-1.5 py-0.5 text-muted hover:bg-hover hover:text-text"
              >
                {t("alerts.delete")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
