export const RIGHT_DOCK_MIN_WIDTH = 260;
export const RIGHT_DOCK_MAX_WIDTH = 500;
export const RIGHT_DOCK_DEFAULT_WIDTH = 280;
export const RIGHT_DOCK_WIDTH_KEY = "raibro.rightDockWidth";

/** Clamp a width into the 260–500px range (falls back to the default when NaN). */
export function clampDockWidth(width: number): number {
  if (!Number.isFinite(width)) return RIGHT_DOCK_DEFAULT_WIDTH;
  return Math.min(RIGHT_DOCK_MAX_WIDTH, Math.max(RIGHT_DOCK_MIN_WIDTH, Math.round(width)));
}

/**
 * Width for a drag: the panel's right edge is fixed, so dragging the left edge
 * left (negative deltaX) widens it. Result is always clamped.
 */
export function widthFromDrag(startWidth: number, deltaX: number): number {
  return clampDockWidth(startWidth - deltaX);
}

/** Read the persisted width, clamped; unknown/invalid values fall back to 280. */
export function loadDockWidth(): number {
  if (typeof localStorage === "undefined") return RIGHT_DOCK_DEFAULT_WIDTH;
  const raw = localStorage.getItem(RIGHT_DOCK_WIDTH_KEY);
  if (raw == null || raw === "") return RIGHT_DOCK_DEFAULT_WIDTH;
  const n = Number(raw);
  return Number.isFinite(n) ? clampDockWidth(n) : RIGHT_DOCK_DEFAULT_WIDTH;
}

/** Persist the clamped width so a reload restores it. */
export function saveDockWidth(width: number): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(RIGHT_DOCK_WIDTH_KEY, String(clampDockWidth(width)));
}
