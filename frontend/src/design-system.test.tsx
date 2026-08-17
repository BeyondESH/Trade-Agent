// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { applyTheme, useTheme } from "./lib/theme";
import { dictionaries, useI18n, type TKey } from "./lib/i18n";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("design system tokens", () => {
  it("applies data-theme to the document root", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("persists theme and restores it on mount", () => {
    const first = renderHook(() => useTheme());
    act(() => first.result.current.setTheme("light"));
    first.unmount();
    const second = renderHook(() => useTheme());
    expect(second.result.current.theme).toBe("light");
  });

  it("defines both tv themes in the root CSS with TV color values", () => {
    const css = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.css"),
      "utf-8",
    );
    expect(css).toMatch(/data-theme="dark"[\s\S]*#131722/);
    expect(css).toMatch(/data-theme="dark"[\s\S]*--tv-accent: #2962ff/);
    expect(css).toMatch(/--tv-up: #089981/);
    expect(css).toMatch(/--tv-down: #f23645/);
    expect(css).toMatch(/--tv-muted: #787b86/);
    expect(css).toMatch(/data-theme="light"[\s\S]*--tv-bg: #ffffff/);
  });

  it("maps tailwind color tokens to the tv CSS variables", () => {
    const cfg = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../tailwind.config.js"),
      "utf-8",
    );
    expect(cfg).toMatch(/base: "var\(--tv-bg\)"/);
    expect(cfg).toMatch(/panel: "var\(--tv-panel\)"/);
    expect(cfg).toMatch(/border: "var\(--tv-border\)"/);
    expect(cfg).toMatch(/up: "var\(--tv-up\)"/);
    expect(cfg).toMatch(/down: "var\(--tv-down\)"/);
    expect(cfg).toMatch(/accent: "var\(--tv-accent\)"/);
    expect(cfg).toMatch(/'Trebuchet MS'/);
  });
});

describe("i18n", () => {
  it("zh and en dictionaries share exactly the same keys", () => {
    const zhKeys = Object.keys(dictionaries.zh).sort();
    const enKeys = Object.keys(dictionaries.en).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it("returns the key itself for unknown keys (fallback)", () => {
    const { result } = renderHook(() => useI18n());
    expect(result.current.t("topbar.search" as TKey)).toBeTruthy();
  });

  it("switches language and persists it", () => {
    const { result, unmount } = renderHook(() => useI18n());
    expect(result.current.locale).toBe("zh");
    act(() => result.current.setLocale("en"));
    expect(result.current.t("topbar.search")).toBe("Search symbols");
    expect(localStorage.getItem("raibro.locale")).toBe("en");
    unmount();
    const restored = renderHook(() => useI18n());
    expect(restored.result.current.locale).toBe("en");
  });
});
