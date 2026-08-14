import type { Chart, KLineData, OverlayCreate } from "klinecharts";

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
}
