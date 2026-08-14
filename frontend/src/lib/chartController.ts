import {
  ActionType,
  dispose,
  init,
  type Chart,
  type KLineData,
  type OverlayCreate,
} from "klinecharts";

export interface ChartTerminalOptions {
  container: HTMLElement;
  onDataPointClick?: (point: { timestamp: number; value: number }) => void;
}

export type IndicatorSpec = {
  name: string;
  pane: "candle" | "sub";
};

export type PersistedOverlay = {
  id: string;
  name: string;
  points: Array<Partial<{ dataIndex: number; timestamp: number; value: number }>>;
  styles?: Record<string, unknown>;
  groupId?: string;
};

const CANDLE_PANE = "candle_pane";
const SUB_PANE_PREFIX = "indicator_pane";

let paneSeq = 0;

/** Thin ownership wrapper over a klinecharts instance (testable without canvas). */
export class ChartController {
  private chart: Chart | null = null;
  private overlayIds = new Set<string>();
  private indicatorPanes: Record<string, string> = {}; // indicator name -> paneId (sub-panes)

  init(options: ChartTerminalOptions): void {
    const chart = init(options.container, {
      locale: "en-US",
      styles: {
        grid: { horizontal: { color: "#161b22" }, vertical: { color: "#161b22" } },
        candle: {
          bar: { upColor: "#16c784", downColor: "#ea3943", noChangeColor: "#848e9c" },
        },
        xAxis: { axisLine: { color: "#232a33" } },
        yAxis: { axisLine: { color: "#232a33" } },
      },
    });
    if (!chart) throw new Error("klinecharts failed to initialize");
    this.chart = chart;
    if (options.onDataPointClick) {
      chart.subscribeAction(ActionType.OnCandleBarClick, (data?: KLineData) => {
        if (data) options.onDataPointClick?.({ timestamp: data.timestamp, value: data.close });
      });
    }
  }

  applyData(list: KLineData[]): void {
    this.chart?.applyNewData(list, false);
  }

  updateData(bar: KLineData): void {
    this.chart?.updateData(bar);
  }

  addIndicator(spec: IndicatorSpec): void {
    if (!this.chart) return;
    if (spec.pane === "candle") {
      this.chart.createIndicator({ name: spec.name }, true);
      return;
    }
    if (this.indicatorPanes[spec.name]) return;
    const paneId = `${SUB_PANE_PREFIX}_${paneSeq++}`;
    const created = this.chart.createIndicator({ name: spec.name }, false, { id: paneId });
    this.indicatorPanes[spec.name] = created ?? paneId;
  }

  removeIndicator(spec: IndicatorSpec): void {
    if (!this.chart) return;
    if (spec.pane === "candle") {
      this.chart.removeIndicator(CANDLE_PANE, spec.name);
      return;
    }
    const paneId = this.indicatorPanes[spec.name];
    if (paneId) {
      this.chart.removeIndicator(paneId);
      delete this.indicatorPanes[spec.name];
    }
  }

  createOverlay(create: OverlayCreate): void {
    if (!this.chart) return;
    const id = this.chart.createOverlay(create) as unknown as string | null;
    if (id) this.overlayIds.add(id);
  }

  setDrawTool(tool: string | null): void {
    if (!this.chart) return;
    if (tool) {
      this.chart.createOverlay(tool);
    }
  }

  removeAllDrawings(): void {
    this.chart?.removeOverlay();
  }

  removeDrawing(id: string): void {
    this.chart?.removeOverlay(id);
    this.overlayIds.delete(id);
  }

  removeOverlaysByGroup(groupId: string): void {
    this.chart?.removeOverlay({ groupId });
    for (const id of [...this.overlayIds]) {
      const o = this.chart?.getOverlayById(id);
      if (o?.groupId === groupId) this.overlayIds.delete(id);
    }
  }

  setIndicators(specs: IndicatorSpec[]): void {
    if (!this.chart) return;
    for (const paneId of Object.values(this.indicatorPanes)) {
      this.chart.removeIndicator(paneId);
    }
    this.indicatorPanes = {};
    this.chart.removeIndicator(CANDLE_PANE);
    for (const spec of specs) this.addIndicator(spec);
  }

  restoreOverlays(drawings: Array<{
    name: string;
    points: Array<Partial<{ dataIndex: number; timestamp: number; value: number }>>;
    styles?: Record<string, unknown>;
    groupId?: string;
  }>): void {
    if (!this.chart) return;
    for (const d of drawings) {
      const id = this.chart.createOverlay({
        name: d.name,
        points: d.points,
        styles: d.styles,
        groupId: d.groupId,
      }) as unknown as string | null;
      if (id) this.overlayIds.add(id);
    }
  }

  getOverlays(): PersistedOverlay[] {
    if (!this.chart) return [];
    const result: PersistedOverlay[] = [];
    for (const id of this.overlayIds) {
      const o = this.chart.getOverlayById(id);
      if (!o) continue;
      result.push({
        id,
        name: o.name,
        points: o.points.map((p) => ({ timestamp: p.timestamp, value: p.value })),
        styles: o.styles as Record<string, unknown> | undefined,
        groupId: o.groupId,
      });
    }
    return result;
  }

  destroy(): void {
    if (this.chart) {
      dispose(this.chart);
      this.chart = null;
    }
    this.overlayIds.clear();
    this.indicatorPanes = {};
  }
}
