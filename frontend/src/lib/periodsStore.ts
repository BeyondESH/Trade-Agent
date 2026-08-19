/**
 * Persisted "pinned" timeframe preference for the chart period bar.
 *
 * Storage uses the `raibro.*` namespace (see alertsStore). The pinned list is
 * a global user preference (not keyed by symbol/series), so it lives in
 * browser localStorage rather than the backend chartstore (which is keyed per
 * category/symbol/timeframe).
 *
 * An exhausted (empty) pinned list is distinct from "no record": no record
 * resolves to the defaults; an explicitly saved empty list stays empty.
 */

/** Default pinned timeframes (internal identifiers), used when no record exists. */
export const DEFAULT_PINNED_TIMEFRAMES: string[] = [
  "1m",
  "15m",
  "1h",
  "6h",
  "1d",
  "1w",
  "1mo",
];

const STORAGE_KEY = "raibro.pinnedTimeframes";

/** Whether the user has an explicit pinned-preference record (including empty). */
export function hasPinnedRecord(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) != null;
  } catch {
    return false;
  }
}

/**
 * Load the pinned timeframes. Returns the defaults when there is no saved
 * record or the stored value is unreadable; an explicit empty list is honored.
 */
export function loadPinnedTimeframes(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return [...DEFAULT_PINNED_TIMEFRAMES];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_PINNED_TIMEFRAMES];
    const valid = parsed.filter(
      (x): x is string => typeof x === "string" && x.length > 0,
    );
    return valid;
  } catch {
    return [...DEFAULT_PINNED_TIMEFRAMES];
  }
}

/** Persist the pinned timeframes (may be an empty list) and notify listeners. */
export function savePinnedTimeframes(timeframes: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timeframes));
  } catch {
    /* storage may be unavailable; in-memory session still works */
  }
  notifyPinnedChanged();
}

/** Toggle a timeframe in the pinned list; returns the new list. */
export function togglePinnedTimeframe(timeframe: string, pinned: string[]): string[] {
  const next = pinned.includes(timeframe)
    ? pinned.filter((t) => t !== timeframe)
    : [...pinned, timeframe];
  savePinnedTimeframes(next);
  return next;
}

// --- change notification --------------------------------------------------
type PinnedListener = (timeframes: string[]) => void;
const listeners = new Set<PinnedListener>();

export function subscribePinnedTimeframes(fn: PinnedListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyPinnedChanged(): void {
  const pinned = loadPinnedTimeframes();
  for (const fn of [...listeners]) {
    try {
      fn(pinned);
    } catch {
      /* a broken listener must not break the store */
    }
  }
}
