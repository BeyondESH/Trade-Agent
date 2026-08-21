// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MIGRATION_THRESHOLD, useMasonry } from "./useMasonry";

interface Item {
  id: string;
  ts: number;
  text: string;
}

// Estimated height = text length * 10 (deterministic for column balance tests).
const estimate = (i: Item) => i.text.length * 10;

function mk(id: string, ts: number, textLen: number): Item {
  return { id, ts, text: "x".repeat(textLen) };
}

function flat(columns: Readonly<Readonly<Item[]>[]>): string[] {
  return columns.flat().map((i) => i.id);
}

describe("useMasonry", () => {
  it("distributes newest-first items into the shortest estimated column", () => {
    const items = [
      mk("a", 3, 4), // est 40
      mk("b", 2, 8), // est 80
      mk("c", 1, 2), // est 20
      mk("d", 0, 6), // est 60
    ];
    const { result } = renderHook(() => useMasonry(items, estimate));

    expect(result.current.columnCount).toBe(2); // jsdom: no matchMedia
    expect(flat(result.current.columns).sort()).toEqual(["a", "b", "c", "d"]);
    // a(40)->col0, b(80)->col1, c(20)->min(40,80)=col0, d(60)->min(60,80)=col0
    expect(result.current.columns[0].map((i) => i.id)).toEqual(["a", "c", "d"]);
    expect(result.current.columns[1].map((i) => i.id)).toEqual(["b"]);
  });

  it("keeps each column newest-first after placement", () => {
    const items = [
      mk("n0", 3, 3),
      mk("n1", 2, 3),
      mk("n2", 1, 3),
      mk("n3", 0, 3),
    ];
    const { result } = renderHook(() => useMasonry(items, estimate));
    for (const col of result.current.columns) {
      const ts = col.map((i) => i.ts);
      expect(ts).toEqual([...ts].sort((a, b) => b - a));
    }
  });

  it("places a live (newer) item into the shortest column top", () => {
    const initial = [mk("a", 2, 4), mk("b", 1, 4)];
    const { result, rerender } = renderHook(({ items }) => useMasonry(items, estimate), {
      initialProps: { items: initial },
    });

    const live = [mk("z", 3, 4), ...initial];
    rerender({ items: live });

    expect(flat(result.current.columns).sort()).toEqual(["a", "b", "z"]);
    // col0 = [a], col1 = [b] (equal heights); shortest is col1 -> z lands there on top
    const colWithZ = result.current.columns.find((c) => c.some((i) => i.id === "z"))!;
    expect(colWithZ[0].id).toBe("z");
  });

  it("appends a revealed older item at the bottom of the shortest column", () => {
    const initial = [mk("a", 3, 4), mk("b", 2, 4)];
    const { result, rerender } = renderHook(({ items }) => useMasonry(items, estimate), {
      initialProps: { items: initial },
    });

    const older = [...initial, mk("o", 1, 4)];
    rerender({ items: older });

    const colWithO = result.current.columns.find((c) => c.some((i) => i.id === "o"))!;
    expect(colWithO[colWithO.length - 1].id).toBe("o");
  });

  it("migrates a measured card when its column exceeds the threshold", () => {
    const items = [
      mk("a", 3, 3), // est 30
      mk("b", 2, 3), // est 30
      mk("c", 1, 3), // est 30
    ];
    const { result } = renderHook(() => useMasonry(items, estimate));

    // a->col0, b->col1, c->col0 (ties resolved to the first shortest column)
    const before = result.current.columns.map((c) => c.map((i) => i.id));
    expect(before[0]).toEqual(["a", "c"]);
    expect(before[1]).toEqual(["b"]);

    // c's measured height jumps to 200: col0 becomes 230 vs col1 30, way over
    // threshold (0.5 * 200 = 100) -> c migrates to col1.
    act(() => {
      result.current.measure("c", 200);
    });

    const after = result.current.columns.map((c) => c.map((i) => i.id));
    expect(after[1]).toContain("c");
    expect(after[0]).toEqual(["a"]);
  });

  it("does not migrate below the threshold", () => {
    const items = [
      mk("a", 3, 3), // est 30
      mk("b", 2, 3), // est 30
      mk("c", 1, 3), // est 30
      mk("d", 0, 3), // est 30
    ];
    const { result } = renderHook(() => useMasonry(items, estimate));

    // a->col0, b->col1, c->col0, d->col1 -> both columns total 60
    act(() => {
      result.current.measure("c", 40); // col0 = 70 vs col1 = 60, delta 10 <= 0.5*40
    });

    const after = result.current.columns.map((c) => c.map((i) => i.id));
    expect(after[0]).toEqual(["a", "c"]);
    expect(after[1]).toEqual(["b", "d"]);
  });

  it("ignores non-positive measurements", () => {
    const items = [mk("a", 1, 3)];
    const { result } = renderHook(() => useMasonry(items, estimate));
    act(() => {
      result.current.measure("a", 0);
    });
    expect(flat(result.current.columns)).toEqual(["a"]);
  });

  it("prunes columns when items disappear (topic filter)", () => {
    const items = [
      mk("a", 3, 3),
      mk("b", 2, 3),
      mk("c", 1, 3),
    ];
    const { result, rerender } = renderHook(({ items }) => useMasonry(items, estimate), {
      initialProps: { items },
    });

    rerender({ items: [mk("b", 2, 3)] });
    expect(flat(result.current.columns)).toEqual(["b"]);
  });
});
