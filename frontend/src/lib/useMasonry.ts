import { useCallback, useEffect, useReducer, useRef, useState } from "react";

/** Fraction of a card's own height used as the column-rebalance threshold. */
export const MIGRATION_THRESHOLD = 0.5;

interface MasonryState<T extends { id: string; ts: number }> {
  cols: T[][];
  heights: number[];
  assigned: Set<string>;
  measured: Map<string, number>;
}

function getColumnCount(): number {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return 2;
  if (window.matchMedia("(min-width: 1280px)").matches) return 4;
  if (window.matchMedia("(min-width: 768px)").matches) return 3;
  return 2;
}

/** Responsive waterfall column count (2 / 3 / 4 by viewport width). */
export function useColumnCount(): number {
  const [count, setCount] = useState(getColumnCount);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mqls = [
      window.matchMedia("(min-width: 1280px)"),
      window.matchMedia("(min-width: 768px)"),
    ];
    const update = () => setCount(getColumnCount());
    for (const m of mqls) m.addEventListener?.("change", update);
    return () => {
      for (const m of mqls) m.removeEventListener?.("change", update);
    };
  }, []);
  return count;
}

/**
 * JS masonry column placement.
 *
 * - Items (newest-first) are placed one-by-one into the currently shortest
 *   column, using measured heights when known and `estimate` otherwise, so the
 *   newest items spread across the top row without full re-columnation.
 * - `measure(id, height)` records the real mounted height; when the column's
 *   height exceeds the shortest column by more than `threshold * height`, the
 *   card migrates to the actual shortest column (kept newest-first by `ts`).
 */
export function useMasonry<T extends { id: string; ts: number }>(
  items: readonly T[],
  estimate: (item: T) => number,
  threshold: number = MIGRATION_THRESHOLD,
): {
  columns: readonly T[][];
  measure: (id: string, height: number) => void;
  columnCount: number;
} {
  const columnCount = useColumnCount();
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const stateRef = useRef<MasonryState<T>>({
    cols: [],
    heights: [],
    assigned: new Set(),
    measured: new Map(),
  });

  const [, force] = useReducer((n: number) => n + 1, 0);

  const heightOf = useCallback(
    (item: T) => stateRef.current.measured.get(item.id) ?? estimate(item),
    [estimate],
  );

  const rebuild = useCallback(() => {
    const s = stateRef.current;
    s.cols = Array.from({ length: columnCount }, () => [] as T[]);
    s.heights = new Array(columnCount).fill(0);
    s.assigned.clear();
    for (const item of itemsRef.current) {
      s.assigned.add(item.id);
      const col = s.heights.indexOf(Math.min(...s.heights));
      s.cols[col].push(item);
      s.heights[col] += heightOf(item);
    }
    force();
  }, [columnCount, heightOf, force]);

  useEffect(() => {
    rebuild();
  }, [rebuild]);

  // Incremental placement when the visible item set changes (live flush at the
  // front, history reveal at the end, topic filter prunes columns).
  const key = items.map((i) => i.id).join("|");
  const keyRef = useRef(key);
  useEffect(() => {
    if (key === keyRef.current) return;
    keyRef.current = key;
    const s = stateRef.current;
    const current = new Set(itemsRef.current.map((i) => i.id));
    for (const id of Array.from(s.assigned)) {
      if (!current.has(id)) s.assigned.delete(id);
    }
    for (const col of s.cols) {
      for (let i = col.length - 1; i >= 0; i--) {
        if (!current.has(col[i].id)) col.splice(i, 1);
      }
    }
    for (let c = 0; c < s.cols.length; c++) {
      s.heights[c] = s.cols[c].reduce((sum, it) => sum + heightOf(it), 0);
    }
    for (const item of itemsRef.current) {
      if (s.assigned.has(item.id)) continue;
      s.assigned.add(item.id);
      const col = s.heights.indexOf(Math.min(...s.heights));
      const arr = s.cols[col];
      // keep the column newest-first: insert by ts so a live item lands at
      // the top and a revealed older item lands at the bottom.
      const insertAt = arr.findIndex((it) => it.ts < item.ts);
      arr.splice(insertAt < 0 ? arr.length : insertAt, 0, item);
      s.heights[col] += heightOf(item);
    }
    force();
  }, [key, heightOf, force]);

  const measure = useCallback(
    (id: string, height: number) => {
      if (!Number.isFinite(height) || height <= 0) return;
      const s = stateRef.current;
      const colIdx = s.cols.findIndex((col) => col.some((it) => it.id === id));
      if (colIdx < 0) return;
      const item = s.cols[colIdx].find((it) => it.id === id);
      if (!item) return;
      const prev = s.measured.get(id);
      s.measured.set(id, height);
      s.heights[colIdx] += height - (prev ?? estimate(item));
      const min = Math.min(...s.heights);
      if (s.heights[colIdx] - min > threshold * height && s.cols.length > 1) {
        const target = s.heights.indexOf(min);
        if (target !== colIdx) {
          const arr = s.cols[colIdx];
          arr.splice(arr.indexOf(item), 1);
          const tarr = s.cols[target];
          const insertAt = tarr.findIndex((it) => it.ts < item.ts);
          tarr.splice(insertAt < 0 ? tarr.length : insertAt, 0, item);
          s.heights[colIdx] -= height;
          s.heights[target] += height;
        }
      }
      force();
    },
    [estimate, threshold, force],
  );

  return { columns: stateRef.current.cols, measure, columnCount };
}
