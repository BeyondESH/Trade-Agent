import type { Chart, OverlayCreate } from "klinecharts";
import type { ActionType } from "klinecharts";
import type { ChartSyncBus, DrawSyncPayload } from "./chartSyncBus";
import { DrawSyncRegistry, applyRemoteCrosshair, guarded, pointsToDataCoords, visibleTimestamps } from "./chartSyncActions";
import type { SuppressRef } from "./chartSyncActions";

export interface CellSetupCallbacks {
  /** True while this cell is the active/primary chart. */
  isPrimary: () => boolean;
  /** Overlay selection changes (drives the floating toolbar; only primary cares). */
  onSelect: (overlayId: string | null) => void;
  /** Raw visible-range notifications (primary uses it for back-to-live). */
  onVisibleRange: (data: unknown) => void;
  /** `category:instId` of the series currently shown by this cell. */
  getSymbolKey: () => string;
  /** localStorage key used for drawing persistence of this cell's series. */
  getSeriesKey: () => string;
  /** Record a freshly created overlay id (persistence/undo bookkeeping). */
  recordOverlay: (id: string) => void;
  /** Forget an overlay id. */
  dropOverlay: (id: string) => void;
}

export interface CellSetup {
  cleanup: () => void;
}

/**
 * Wire one chart instance into the sync fabric:
 * - right-side future padding + VOL underlay,
 * - createOverlay injection (selection tracking + drawing-sync emission),
 * - crosshair / visible-range emission to the bus,
 * - remote-event listeners are NOT installed here (the App registers them on
 *   the bus per cell index; they need imperative handles).
 * Returns a cleanup restoring everything.
 */
export function setupCellChart(
  chart: Chart,
  index: number,
  bus: ChartSyncBus,
  suppress: SuppressRef,
  registry: DrawSyncRegistry,
  cb: CellSetupCallbacks,
): CellSetup {
  // ~5% future padding on the right of the time axis
  chart.setOffsetRightDistance(Math.max(40, Math.round(((chart.getSize()?.width ?? 800) * 0.05) || 60)));

  // volume as a semi-transparent overlay stacked on the candle pane
  const volPane = chart.createIndicator({ name: "VOL" }, true, { id: "candle_pane" });
  if (volPane) {
    chart.overrideIndicator(
      {
        styles: {
          bars: [
            {
              upColor: "rgba(8,153,129,0.5)",
              downColor: "rgba(242,54,69,0.5)",
              noChangeColor: "rgba(120,123,134,0.5)",
            },
          ],
        },
      } as unknown as import("klinecharts").IndicatorCreate,
      "candle_pane",
    );
  }

  // rAF throttling for high-frequency emissions
  let crosshairPending = false;
  let rangePending = false;
  let drawMovePending: DrawSyncPayload | null = null;

  const emitCrosshair = (timestamp: number | null) => {
    if (crosshairPending) return;
    crosshairPending = true;
    requestAnimationFrame(() => {
      crosshairPending = false;
      bus.emit("crosshair", index, { timestamp });
    });
  };

  const emitRange = () => {
    if (rangePending) return;
    rangePending = true;
    requestAnimationFrame(() => {
      rangePending = false;
      const ts = visibleTimestamps(chart);
      if (ts) bus.emit("range", index, ts);
    });
  };

  // --- drawing sync emission -------------------------------------------
  const drawEmit = (payload: DrawSyncPayload) => {
    if (suppress.current > 0) return; // programmatic: remote apply or symbol switch
    bus.emit("draw", index, payload);
  };

  // Drag moves flood the bus; coalesce them per chart with rAF.
  const drawMoveEmit = (payload: DrawSyncPayload) => {
    if (suppress.current > 0) return;
    const first = drawMovePending === null;
    drawMovePending = payload;
    if (first) {
      requestAnimationFrame(() => {
        const p = drawMovePending;
        drawMovePending = null;
        if (p && suppress.current === 0) bus.emit("draw", index, p);
      });
    }
  };

  const chartAny = chart as unknown as { createOverlay: Chart["createOverlay"] };
  const orig = chartAny.createOverlay.bind(chart);
  const inject = (v: string | OverlayCreate): string | OverlayCreate => {
    if (typeof v === "string") return v;
    return {
      ...v,
      onSelected: (event) => {
        if (cb.isPrimary()) cb.onSelect(event.overlay?.id ?? null);
        return false;
      },
      onDeselected: () => {
        if (cb.isPrimary()) cb.onSelect(null);
        return false;
      },
      onDrawEnd: (event) => {
        const o = event.overlay;
        if (o?.id) {
          drawEmit({
            opId: o.id,
            op: "create",
            name: o.name,
            points: pointsToDataCoords(
              chart,
              (o.points ?? []) as Array<{ x?: number; y?: number; timestamp?: number; value?: number; dataIndex?: number }>,
            ),
            styles: (o.styles ?? {}) as Record<string, unknown>,
            sourceSeries: cb.getSymbolKey(),
          });
        }
        return false;
      },
      onPressedMoving: (event) => {
        const o = event.overlay;
        if (o?.id) {
          drawMoveEmit({
            opId: o.id,
            op: "override",
            points: pointsToDataCoords(
              chart,
              (o.points ?? []) as Array<{ x?: number; y?: number; timestamp?: number; value?: number; dataIndex?: number }>,
            ),
            sourceSeries: cb.getSymbolKey(),
          });
        }
        return false;
      },
      onRemoved: (event) => {
        const id = event.overlay?.id;
        if (id) {
          cb.dropOverlay(id);
          registry.unlinkOverlay(id);
          drawEmit({ opId: id, op: "remove", sourceSeries: cb.getSymbolKey() });
        }
        if (cb.isPrimary() && id) cb.onSelect(null);
        return false;
      },
    } as OverlayCreate;
  };
  chartAny.createOverlay = ((value, paneId) => {
    const result = Array.isArray(value) ? orig(value.map(inject), paneId) : orig(inject(value), paneId);
    const ids = Array.isArray(result) ? result : [result];
    for (const id of ids) {
      if (typeof id === "string") cb.recordOverlay(id);
    }
    return result;
  }) as Chart["createOverlay"];

  // --- local event emission (crosshair + visible range) ------------------
  const actionSubs: Array<{ type: ActionType; fn: (data?: unknown) => void }> = [];
  const subscribe = (type: ActionType, fn: (data?: unknown) => void) => {
    chart.subscribeAction(type, fn as (data?: never) => void);
    actionSubs.push({ type, fn });
  };

  subscribe("onCrosshairChange" as unknown as ActionType, (data) => {
    if (suppress.current > 0) return;
    const ts = (data as { kLineData?: { timestamp?: number } } | undefined)?.kLineData?.timestamp;
    emitCrosshair(typeof ts === "number" ? ts : null);
  });

  subscribe("onVisibleRangeChange" as unknown as ActionType, (data) => {
    cb.onVisibleRange(data);
    if (suppress.current > 0) return;
    emitRange();
  });

  const cleanup = () => {
    for (const { type, fn } of actionSubs) {
      chart.unsubscribeAction(type, fn as (data?: never) => void);
    }
  };
  return { cleanup };
}

export { applyRemoteCrosshair, guarded };
