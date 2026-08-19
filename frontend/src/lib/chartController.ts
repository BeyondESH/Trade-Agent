import type { Chart, DomPosition, KLineData, OverlayCreate } from "klinecharts";
import { priceLineToOverlay } from "./transform";
import { priceLineColor, type Alert } from "./alertsStore";
import type { ThemeMode } from "../types/trading";

export type IndicatorSpec = { name: string; pane: "candle" | "sub" };

const CANDLE_PANE = "candle_pane";
const SUB_PANE_PREFIX = "indicator_pane";

let paneSeq = 0;

/** Auto-layer controller: drives a klinecharts instance obtained from klinecharts-pro. */
export class AutoLayerController {
  private widget: Chart | null = null;
  private overlayIds = new Set<string>();
  private indicatorPanes: Record<string, string> = {};

  attach(widget: Chart | null): void {
    this.detach();
    this.widget = widget;
  }

  detach(): void {
    this.widget = null;
    this.overlayIds.clear();
    this.indicatorPanes = {};
  }

  applyData(list: KLineData[]): void {
    this.widget?.applyNewData(list, false);
  }

  clearData(): void {
    this.widget?.applyNewData([], false);
  }

  updateData(bar: KLineData): void {
    this.widget?.updateData(bar);
  }

  addIndicator(spec: IndicatorSpec): void {
    if (!this.widget) return;
    if (spec.pane === "candle") {
      this.widget.createIndicator({ name: spec.name }, true);
      return;
    }
    if (this.indicatorPanes[spec.name]) return;
    const paneId = `${SUB_PANE_PREFIX}_${paneSeq++}`;
    const created = this.widget.createIndicator({ name: spec.name }, false, { id: paneId });
    this.indicatorPanes[spec.name] = created ?? paneId;
  }

  setIndicators(specs: IndicatorSpec[]): void {
    if (!this.widget) return;
    for (const paneId of Object.values(this.indicatorPanes)) {
      this.widget.removeIndicator(paneId);
    }
    this.indicatorPanes = {};
    this.widget.removeIndicator(CANDLE_PANE);
    for (const spec of specs) this.addIndicator(spec);
  }

  createOverlay(create: OverlayCreate): void {
    if (!this.widget) return;
    const id = this.widget.createOverlay(create) as unknown as string | null;
    if (id) this.overlayIds.add(id);
  }

  removeOverlaysByGroup(groupId: string): void {
    this.widget?.removeOverlay({ groupId });
    for (const id of [...this.overlayIds]) {
      const o = this.widget?.getOverlayById(id);
      if (o?.groupId === groupId) this.overlayIds.delete(id);
    }
  }

  removeAllDrawings(): void {
    this.widget?.removeOverlay();
    this.overlayIds.clear();
  }

  /** Record an overlay created outside the controller (vendor drawing bar etc.). */
  recordOverlayId(id: string | null): void {
    if (id) this.overlayIds.add(id);
  }

  /** All known overlay ids in creation order. */
  getOverlayIds(): string[] {
    return [...this.overlayIds];
  }

  /** Undo the most recently created drawing (no native klinecharts undo). */
  undoLastDrawing(): void {
    const ids = this.getOverlayIds();
    const id = ids[ids.length - 1];
    if (!id) return;
    this.widget?.removeOverlay({ id });
    this.overlayIds.delete(id);
  }
}

// --- price-line overlay sync (unified reference/alert lines) --------------------
// The alertsStore is the single source of truth; overlays are a transient
// projection rebuilt whenever the store, symbol, theme, or chart changes.

export const PRICE_LINE_GROUP_ID = "manual-price-lines";

export interface PriceLineToDraw {
  alertId: string;
  price: number;
  color: string;
  title?: string;
}

export interface PriceLineSyncEvents {
  onClick?: (alertId: string) => void;
  onDragEnd?: (alertId: string, price: number) => void;
}

/** Drop every price-line overlay and redraw the given lines (idempotent). */
export function syncPriceLineOverlays(
  widget: Chart | null,
  lines: PriceLineToDraw[],
  events?: PriceLineSyncEvents,
): void {
  if (!widget) return;
  widget.removeOverlay({ groupId: PRICE_LINE_GROUP_ID });
  for (const line of lines) {
    const create = priceLineToOverlay({
      price: line.price,
      color: line.color,
      title: line.title,
      alertId: line.alertId,
    });
    create.groupId = PRICE_LINE_GROUP_ID;
    if (events) {
      create.onClick = () => {
        events.onClick?.(line.alertId);
        return true;
      };
      create.onPressedMoveEnd = (ev) => {
        const value = ev.overlay?.points?.[0]?.value;
        if (typeof value === "number" && Number.isFinite(value)) {
          events.onDragEnd?.(line.alertId, value);
        }
        return true;
      };
    }
    widget.createOverlay(create);
  }
}

/** Map the current symbol's entities (reference + alert lines) to overlay configs. */
export function alertLinesToDraw(
  alerts: Alert[],
  symbol: string,
  theme: ThemeMode,
): PriceLineToDraw[] {
  return alerts
    .filter((a) => a.symbol === symbol)
    .map((a) => ({
      alertId: a.id,
      price: a.threshold,
      color: priceLineColor(a, theme),
      title: a.enabled
        ? `${a.condition === "above" ? "≥" : "≤"} ${a.threshold}`
        : String(a.threshold),
    }));
}

// --- pixel <-> price helpers (chart context menu) -------------------------------

/** Convert a client (screen) position into a price on the candle pane, or null. */
export function pixelToPrice(
  chart: Chart | null,
  clientX: number,
  clientY: number,
): number | null {
  if (!chart) return null;
  const root = chart.getDom();
  if (!root) return null;
  const rect = root.getBoundingClientRect();
  const point = chart.convertFromPixel(
    [{ x: clientX - rect.left, y: clientY - rect.top }],
    { paneId: "candle_pane", absolute: true },
  );
  const p = Array.isArray(point) ? point[0] : point;
  const value = p?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** True when the client position falls inside a pane's main drawing area. */
export function isInsidePane(
  chart: Chart | null,
  paneId: string,
  clientX: number,
  clientY: number,
): boolean {
  if (!chart) return false;
  const dom = chart.getDom(paneId, "main" as DomPosition);
  if (!dom) return false;
  const rect = dom.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}
