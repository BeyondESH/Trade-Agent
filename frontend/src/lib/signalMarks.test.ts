import { describe, expect, it } from "vitest";
import { signalsToMarks, signalMarkToOverlay, signalsToOverlays } from "./signalMarks";

describe("signalsToMarks", () => {
  const priceByTs = new Map<number, number>([
    [1000, 10],
    [2000, 20],
    [3000, 30],
  ]);

  it("maps +1/-1 to long/short and skips 0", () => {
    const marks = signalsToMarks([1, -1, 0, 1], [1000, 2000, 3000, 3000], priceByTs);
    expect(marks).toHaveLength(3);
    expect(marks[0]).toEqual({ timestamp: 1000, price: 10, side: "long" });
    expect(marks[1]).toEqual({ timestamp: 2000, price: 20, side: "short" });
  });

  it("skips timestamps absent from the price map", () => {
    const marks = signalsToMarks([1], [9999], priceByTs);
    expect(marks).toHaveLength(0);
  });

  it("handles mismatched lane lengths", () => {
    expect(signalsToMarks([1, 1, 1], [1000], priceByTs)).toHaveLength(1);
    expect(signalsToMarks([], [], priceByTs)).toHaveLength(0);
  });
});

describe("signalMarkToOverlay", () => {
  it("builds a long overlay pointing up with 多 text", () => {
    const o = signalMarkToOverlay({ timestamp: 1000, price: 10, side: "long" }, 0);
    expect(o.name).toBe("signalMark");
    expect(o.groupId).toBe("backtest-signals");
    expect(o.points).toEqual([{ timestamp: 1000, value: 10 }]);
    expect((o.extendData as { text: string; dir: number }).text).toBe("多");
    expect((o.extendData as { dir: number }).dir).toBe(1);
    expect(typeof o.createPointFigures).toBe("function");
  });

  it("builds a short overlay with downward direction", () => {
    const o = signalMarkToOverlay({ timestamp: 2000, price: 20, side: "short" }, 1);
    expect((o.extendData as { text: string }).text).toBe("空");
    expect((o.extendData as { dir: number }).dir).toBe(-1);
  });

  it("aggregates a full lane into overlays", () => {
    const overlays = signalsToOverlays(
      [1, -1, 0],
      [1000, 2000, 3000],
      new Map([[1000, 10], [2000, 20], [3000, 30]]),
    );
    expect(overlays).toHaveLength(2);
  });
});
