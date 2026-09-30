/**
 * Display formatters shared by the desk and the data views.
 *
 * The backend hands back raw numeric strings for quote volume (e.g.
 * "2554663417.12124"), which is unreadable in a dense terminal. These collapse
 * to magnitude suffixes and keep the tabular-figure contract intact.
 */

/** Compact a numeric string/number to a 2-decimal magnitude: 2.55B / 14.67M. */
export function compactNumber(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === "" || raw === "-") return "\u2014";
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return "\u2014";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}

/** Price at the instrument's own precision, em dash before the first quote. */
export function formatPrice(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0)
    return "\u2014";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Signed percentage, always 2 decimals: +1.24% / -0.41%. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "\u2014";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** 24h amplitude as a percentage of the low, or null when the range is unknown. */
export function amplitudePercent(high: number, low: number): number | null {
  if (!Number.isFinite(high) || !Number.isFinite(low) || low <= 0) return null;
  return ((high - low) / low) * 100;
}
