import type { Chart, OverlayCreate } from "klinecharts";

const KEY_PREFIX = "raibro.drawings.";

export interface DrawingRecord {
  id: string;
  name: string;
  points: unknown[];
  styles?: Record<string, unknown>;
  groupId?: string;
}

/** Auto layers (S/R, structure, SMC) are regenerated from analysis and must not persist. */
function isAutoOverlay(groupId: string | undefined): boolean {
  return !!groupId?.startsWith("auto-") || groupId === "alert-lines";
}

export function saveDrawings(chart: Chart, seriesKey: string, overlayIds: string[]): void {
  const records: DrawingRecord[] = [];
  for (const id of overlayIds) {
    const o = chart.getOverlayById(id);
    if (!o || isAutoOverlay(o.groupId)) continue;
    records.push({
      id: o.id,
      name: o.name,
      points: o.points,
      styles: o.styles ?? {},
      groupId: o.groupId,
    });
  }
  if (records.length === 0) {
    try {
      localStorage.removeItem(KEY_PREFIX + seriesKey);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    localStorage.setItem(KEY_PREFIX + seriesKey, JSON.stringify(records));
  } catch {
    /* storage may be unavailable */
  }
}

export function loadDrawings(seriesKey: string): DrawingRecord[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + seriesKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DrawingRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function restoreDrawings(chart: Chart, seriesKey: string): void {
  for (const r of loadDrawings(seriesKey)) {
    chart.createOverlay({
      name: r.name,
      points: r.points as OverlayCreate["points"],
      styles: (r.styles ?? {}) as OverlayCreate["styles"],
      groupId: r.groupId,
    });
  }
}
