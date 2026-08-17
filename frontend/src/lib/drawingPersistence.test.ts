// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Chart, Overlay } from "klinecharts";
import { loadDrawings, restoreDrawings, saveDrawings } from "./drawingPersistence";

function makeOverlay(id: string, name: string, groupId?: string): Overlay {
  return {
    id,
    name,
    groupId,
    points: [{ value: 100 }],
    styles: {},
  } as unknown as Overlay;
}

function makeChart(overlays: Overlay[]): Chart {
  return {
    getOverlayById: (id: string) => overlays.find((o) => o.id === id) ?? null,
    createOverlay: vi.fn(),
  } as unknown as Chart;
}

beforeEach(() => {
  localStorage.clear();
});

describe("drawingPersistence", () => {
  it("skips auto-layers and persists only user drawings", () => {
    const chart = makeChart([
      makeOverlay("a", "segment"),
      makeOverlay("b", "priceLine", "auto-sr"),
    ]);
    saveDrawings(chart, "BTCUSDT/5m", ["a", "b"]);
    const stored = loadDrawings("BTCUSDT/5m");
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("segment");
  });

  it("round-trips drawings through restore", () => {
    const chart = makeChart([makeOverlay("a", "segment")]);
    saveDrawings(chart, "BTCUSDT/5m", ["a"]);
    const target = makeChart([]);
    restoreDrawings(target, "BTCUSDT/5m");
    expect(target.createOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ name: "segment" }),
    );
  });

  it("returns empty when nothing stored", () => {
    expect(loadDrawings("nope")).toEqual([]);
  });
});
