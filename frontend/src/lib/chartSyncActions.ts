import type { Chart, DomPosition, KLineData, OverlayCreate } from "klinecharts";
import type { DrawSyncPayload } from "./chartSyncBus";

// klinecharts' CJS entry exports enums as undefined at runtime under vitest,
// so DomPosition values are referenced as string literals (see the type above).
const DOM_MAIN = "main" as unknown as DomPosition;
const DOM_ROOT = "root" as unknown as DomPosition;

/**
 * Re-entrancy guard: while a cell is applying a REMOTE sync event, its own
 * local events (crosshair move, visible-range change) must not be re-broadcast.
 * Counter-based so nested applies stay suppressed until all settle.
 */
export interface SuppressRef {
  current: number;
}

type Scheduler = (fn: () => void) => void;

const defaultLater: Scheduler = (fn) => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fn);
  else setTimeout(fn, 0);
};

export function guarded(suppress: SuppressRef, fn: () => void, later: Scheduler = defaultLater): void {
  suppress.current += 1;
  try {
    fn();
  } finally {
    later(() => {
      suppress.current = Math.max(0, suppress.current - 1);
    });
  }
}

/** Binary-search the bar whose timestamp is closest to `ts`. Returns -1 on empty. */
export function nearestBarIndex(list: Array<{ timestamp: number }>, ts: number): number {
  if (!list.length) return -1;
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].timestamp < ts) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(list[lo - 1].timestamp - ts) < Math.abs(list[lo].timestamp - ts)) {
    return lo - 1;
  }
  return lo;
}

export function countBarsBetween(list: Array<{ timestamp: number }>, fromTs: number, toTs: number): number {
  const a = nearestBarIndex(list, fromTs);
  const b = nearestBarIndex(list, toTs);
  return Math.abs(b - a) + 1;
}

/** Map the current visible range (data indexes) to timestamps. */
export function visibleTimestamps(chart: Chart): { fromTs: number; toTs: number } | null {
  const list = chart.getDataList() as KLineData[];
  if (!list.length) return null;
  const vr = chart.getVisibleRange();
  const from = Math.max(0, Math.min(vr.from, list.length - 1));
  const to = Math.max(0, Math.min(vr.to, list.length - 1));
  return { fromTs: list[from].timestamp, toTs: list[to].timestamp };
}

/**
 * Apply a remote visible range: match the bar span via a relative zoom around
 * the midpoint, then align the left edge with scrollToTimestamp. Caller must
 * wrap this in `guarded` so resulting local events are not re-broadcast.
 */
export function applyRemoteRange(chart: Chart, fromTs: number, toTs: number): void {
  const list = chart.getDataList() as KLineData[];
  if (!list.length || toTs <= fromTs) return;
  const vr = chart.getVisibleRange();
  const current = Math.max(1, vr.to - vr.from + 1);
  const target = countBarsBetween(list, fromTs, toTs);
  const mid = (fromTs + toTs) / 2;
  if (target > 0) {
    const scale = target / current;
    if (Math.abs(scale - 1) > 0.05) {
      chart.zoomAtTimestamp(scale, mid);
    }
  }
  chart.scrollToTimestamp(fromTs);
}

/**
 * Move the crosshair to the bar nearest `timestamp` by dispatching a synthetic
 * mousemove on the chart's main pane (klinecharts has no public crosshair
 * setter, but its pointer pipeline maps client coordinates to bars).
 * Returns false when the chart cannot be addressed. Caller must wrap in
 * `guarded` so the triggered OnCrosshairChange is not re-broadcast.
 */
export function applyRemoteCrosshair(chart: Chart, timestamp: number): boolean {
  const list = chart.getDataList() as KLineData[];
  if (!list.length) return false;
  const idx = nearestBarIndex(list, timestamp);
  if (idx < 0) return false;
  const bar = list[idx];
  let coord: { x?: number; y?: number };
  try {
    const out = chart.convertToPixel([{ timestamp: bar.timestamp, value: bar.close }], {
      paneId: "candle_pane",
    });
    const c = Array.isArray(out) ? out[0] : out;
    if (c.x == null) return false;
    coord = c;
  } catch {
    return false;
  }
  const dom = chart.getDom("candle_pane", DOM_MAIN) ?? chart.getDom(undefined, DOM_ROOT);
  if (!dom) return false;
  const rect = dom.getBoundingClientRect();
  const ev = new MouseEvent("mousemove", {
    clientX: rect.left + (coord.x ?? 0),
    clientY: rect.top + Math.max(1, Math.round(rect.height / 2)),
    bubbles: true,
    cancelable: true,
  });
  dom.dispatchEvent(ev);
  return true;
}

/** Per-cell bookkeeping of mirrored drawings: logical opId <-> local overlay id. */
export class DrawSyncRegistry {
  private byOpId = new Map<string, string>();
  private overlayToOp = new Map<string, string>();

  link(opId: string, overlayId: string): void {
    this.byOpId.set(opId, overlayId);
    this.overlayToOp.set(overlayId, opId);
  }

  unlinkOverlay(overlayId: string): string | null {
    const opId = this.overlayToOp.get(overlayId);
    if (opId != null) {
      this.overlayToOp.delete(overlayId);
      if (this.byOpId.get(opId) === overlayId) this.byOpId.delete(opId);
    }
    return opId ?? null;
  }

  localIdFor(opId: string): string | null {
    return this.byOpId.get(opId) ?? null;
  }

  clear(): void {
    this.byOpId.clear();
    this.overlayToOp.clear();
  }
}

/** Normalize overlay points to data coordinates ({timestamp,value}). */
export function pointsToDataCoords(
  chart: Chart,
  points: Array<{ x?: number; y?: number; timestamp?: number; value?: number; dataIndex?: number }>,
): DrawSyncPayload["points"] {
  const list = chart.getDataList() as KLineData[];
  return points.map((p) => {
    let timestamp = p.timestamp;
    if (timestamp == null && p.dataIndex != null && list[p.dataIndex]) {
      timestamp = list[p.dataIndex].timestamp;
    }
    return { timestamp, value: p.value };
  });
}

/**
 * Apply a remote drawing op onto this cell's chart. Same-symbol filtering is
 * enforced by the caller (the bus listener knows the receiving cell's series).
 */
export function applyRemoteDraw(chart: Chart, registry: DrawSyncRegistry, payload: DrawSyncPayload): void {
  if (payload.op === "remove") {
    const local = registry.localIdFor(payload.opId);
    if (local != null) {
      chart.removeOverlay({ id: local });
      registry.unlinkOverlay(local);
    }
    return;
  }
  if (payload.op === "override") {
    const local = registry.localIdFor(payload.opId);
    if (local != null && payload.points) {
      chart.overrideOverlay({
        id: local,
        points: payload.points as OverlayCreate["points"],
      });
    }
    return;
  }
  // create
  if (!payload.points || registry.localIdFor(payload.opId) != null) return;
  const id = chart.createOverlay({
    name: payload.name ?? "segment",
    points: payload.points as OverlayCreate["points"],
    styles: payload.styles as OverlayCreate["styles"],
    groupId: `sync:${payload.opId}`,
  });
  if (typeof id === "string") {
    registry.link(payload.opId, id);
  }
}
