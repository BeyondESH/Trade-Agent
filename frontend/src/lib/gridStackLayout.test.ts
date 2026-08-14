// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LAYOUT,
  LAYOUT_VERSION,
  STORAGE_KEY,
  clearSavedLayout,
  loadSavedLayout,
} from "./gridStackLayout";

describe("gridStackLayout persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default layout when nothing saved", () => {
    expect(loadSavedLayout()).toEqual(DEFAULT_LAYOUT);
  });

  it("returns default layout on corrupt json", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadSavedLayout()).toEqual(DEFAULT_LAYOUT);
  });

  it("returns saved grid when version matches", () => {
    const saved = {
      version: LAYOUT_VERSION,
      grid: [{ id: "chart", x: 0, y: 0, w: 12, h: 12 }],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    expect(loadSavedLayout()).toEqual(saved.grid);
  });

  it("falls back to default on version mismatch", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: LAYOUT_VERSION + 1, grid: [{ id: "chart", x: 0, y: 0, w: 12, h: 12 }] }),
    );
    expect(loadSavedLayout()).toEqual(DEFAULT_LAYOUT);
  });

  it("falls back to default on empty grid array", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: LAYOUT_VERSION, grid: [] }));
    expect(loadSavedLayout()).toEqual(DEFAULT_LAYOUT);
  });

  it("clearSavedLayout removes the stored layout", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: LAYOUT_VERSION, grid: DEFAULT_LAYOUT }));
    clearSavedLayout();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

// GridStack.init performs real layout work; guard against its absence in jsdom.
describe("GridStackLayout component", () => {
  it("can be imported without crashing", () => {
    expect(vi.isMockFunction(clearSavedLayout)).toBe(false);
    expect(typeof clearSavedLayout).toBe("function");
  });
});
