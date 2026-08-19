export type AlertCondition = "above" | "below";
import { api } from "../api/client";
import type { ThemeMode } from "../types/trading";

export interface Alert {
  id: string;
  symbol: string;
  condition: AlertCondition;
  threshold: number;
  enabled: boolean;
  triggered: boolean;
  createdAt: number;
  /** Custom line color override; falls back to the semantic default when absent. */
  color?: string;
}

// --- price-line color semantics -------------------------------------------------
// A line is an Alert: enabled entities draw as yellow alert lines, disabled ones
// as neutral reference lines (color only distinguishes semantics, not condition).

export const ALERT_LINE_COLOR = "#ff9800";
export const REFERENCE_LINE_COLOR_DARK = "#787b86";
export const REFERENCE_LINE_COLOR_LIGHT = "#5d606b";

export function priceLineColor(
  alert: Pick<Alert, "enabled" | "color">,
  theme: ThemeMode,
): string {
  if (alert.color) return alert.color;
  return alert.enabled
    ? ALERT_LINE_COLOR
    : theme === "dark"
      ? REFERENCE_LINE_COLOR_DARK
      : REFERENCE_LINE_COLOR_LIGHT;
}

const STORAGE_KEY = "raibro.alerts";

export function loadAlerts(): Alert[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Alert[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a) => a && typeof a.id === "string");
  } catch {
    return [];
  }
}

export function saveAlerts(alerts: Alert[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    /* storage may be unavailable */
  }
  notifyAlertsChanged();
}

// --- change notification (chart alert lines re-read on updates) ------------
type AlertsListener = (alerts: Alert[]) => void;
const listeners = new Set<AlertsListener>();

export function subscribeAlerts(fn: AlertsListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyAlertsChanged(): void {
  const alerts = loadAlerts();
  for (const fn of [...listeners]) {
    try {
      fn(alerts);
    } catch {
      /* listener errors must not break the store */
    }
  }
}

export function createAlert(partial: Omit<Alert, "id" | "triggered" | "createdAt">): Alert {
  return {
    ...partial,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    triggered: false,
    createdAt: Date.now(),
  };
}

/** Evaluate a price against an alert. Triggers when crossing the threshold. */
export function evalAlert(alert: Alert, price: number): boolean {
  if (!alert.enabled || alert.triggered || !Number.isFinite(price)) return false;
  return alert.condition === "above" ? price >= alert.threshold : price <= alert.threshold;
}

// --- server sync (cross-device; silent fallback keeps local as source of truth) ---

function asAlert(r: unknown): Alert | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.symbol !== "string") return null;
  return {
    id: o.id,
    symbol: o.symbol,
    condition: o.condition === "below" ? "below" : "above",
    threshold: Number(o.threshold) || 0,
    enabled: !!o.enabled,
    triggered: !!o.triggered,
    createdAt: Number(o.createdAt) || Date.now(),
    color: typeof o.color === "string" && o.color ? o.color : undefined,
  };
}

// --- line entity helpers (chart layer consumes these) ---------------------------

/** Price-line entities belonging to one symbol (reference + alert lines). */
export function loadAlertsForSymbol(symbol: string): Alert[] {
  return loadAlerts().filter((a) => a.symbol === symbol);
}

/** Insert or replace an entity by id, persist locally, and notify listeners. */
export function upsertAlert(alert: Alert): void {
  const rest = loadAlerts().filter((a) => a.id !== alert.id);
  saveAlerts([alert, ...rest]);
}

/** Apply a partial patch to an entity, persist, and notify listeners. */
export function updateAlert(
  id: string,
  patch: Partial<Omit<Alert, "id" | "symbol" | "createdAt">>,
): void {
  const list = loadAlerts();
  const idx = list.findIndex((a) => a.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], ...patch, id: list[idx].id };
  saveAlerts(list);
}

/** Remove an entity, persist, and notify listeners. */
export function removeAlert(id: string): void {
  saveAlerts(loadAlerts().filter((a) => a.id !== id));
}

/**
 * Pull the alert list from the backend. Returns the merged list (server wins
 * for shared ids; local-only items survive so nothing is lost offline) and
 * persists it as the new local snapshot. Returns null when unreachable.
 */
export async function syncAlertsFromServer(): Promise<Alert[] | null> {
  let server: Alert[];
  try {
    const { alerts } = await api.alerts();
    server = (alerts ?? []).map(asAlert).filter((a): a is Alert => a !== null);
  } catch {
    return null;
  }
  const known = new Set(server.map((a) => a.id));
  const localOnly = loadAlerts().filter((a) => !known.has(a.id));
  const merged = [...server, ...localOnly];
  saveAlerts(merged);
  return merged;
}

/** Best-effort mirrors: failures leave the local copy authoritative. */
export function mirrorAlertCreate(alert: Alert): void {
  void api.saveAlert(alert).catch(() => {});
}

export function mirrorAlertUpdate(id: string, patch: Partial<Omit<Alert, "id" | "createdAt">>): void {
  void api.updateAlert(id, patch).catch(() => {});
}

export function mirrorAlertDelete(id: string): void {
  void api.deleteAlert(id).catch(() => {});
}
