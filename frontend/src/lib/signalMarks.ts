import type { OverlayCreate, OverlayCreateFiguresCallback, OverlayFigure } from "klinecharts";

export interface SignalMark {
  timestamp: number;
  price: number;
  side: "long" | "short";
}

export const LONG_COLOR = "#089981";
export const SHORT_COLOR = "#f23645";

/** klinecharts strips createPointFigures/totalStep from OverlayCreate; this
 * extends the public create type with the custom-figure hooks. */
export interface SignalOverlay extends OverlayCreate {
  totalStep: number;
  createPointFigures: OverlayCreateFiguresCallback;
}

/** Map a backtest signal lane (+1/-1) aligned to open_time onto price marks
 * using the given timestamp -> close map (bars missing from the map are
 * skipped so overlays only land on bars the chart actually has). */
export function signalsToMarks(
  signals: number[],
  openTime: number[],
  priceByTs: Map<number, number>,
): SignalMark[] {
  const out: SignalMark[] = [];
  const n = Math.min(signals.length, openTime.length);
  for (let i = 0; i < n; i++) {
    const s = signals[i];
    if (s !== 1 && s !== -1) continue;
    const ts = openTime[i];
    const price = priceByTs.get(ts);
    if (price === undefined) continue;
    out.push({ timestamp: ts, price, side: s === 1 ? "long" : "short" });
  }
  return out;
}

/** Build a klinecharts overlay that draws an arrow + text mark at a point.
 * Long marks sit below the bar pointing up; short marks above pointing down. */
export function signalMarkToOverlay(mark: SignalMark, index: number): SignalOverlay {
  const dir = mark.side === "long" ? 1 : -1;
  const color = mark.side === "long" ? LONG_COLOR : SHORT_COLOR;
  const arrowLen = 40;
  const gap = 6;
  return {
    name: "signalMark",
    id: `signal-${index}`,
    groupId: "backtest-signals",
    totalStep: 1,
    lock: true,
    visible: true,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    points: [{ timestamp: mark.timestamp, value: mark.price }],
    extendData: { text: mark.side === "long" ? "多" : "空", dir, color },
    createPointFigures: ({ coordinates, overlay }): OverlayFigure[] => {
      const p = coordinates[0];
      const ed = (overlay.extendData ?? {}) as { text: string; dir: number; color: string };
      const d = ed.dir >= 0 ? 1 : -1;
      const y0 = p.y + d * gap;
      const y1 = y0 - d * arrowLen;
      const y2 = y1 - d * 5;
      return [
        {
          type: "line",
          attrs: { coordinates: [{ x: p.x, y: y0 }, { x: p.x, y: y1 }] },
          styles: { color: ed.color },
          ignoreEvent: true,
        },
        {
          type: "polygon",
          attrs: {
            coordinates: [
              { x: p.x, y: y1 },
              { x: p.x - 4, y: y2 },
              { x: p.x + 4, y: y2 },
            ],
          },
          styles: { color: ed.color },
          ignoreEvent: true,
        },
        {
          type: "text",
          attrs: {
            x: p.x,
            y: y2 + d * 4,
            text: ed.text,
            align: "center",
            baseline: d >= 0 ? "bottom" : "top",
          },
          styles: { color: ed.color },
          ignoreEvent: true,
        },
      ];
    },
  };
}

/** Build all overlay definitions for a result's signal lane. */
export function signalsToOverlays(
  signals: number[],
  openTime: number[],
  priceByTs: Map<number, number>,
): SignalOverlay[] {
  return signalsToMarks(signals, openTime, priceByTs).map(signalMarkToOverlay);
}
