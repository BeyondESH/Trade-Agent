import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const distPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../vendor/klinecharts-pro/dist/klinecharts-pro.js",
);

/**
 * Regression guards for the symbol/period switch race fix in the vendored
 * klinecharts-pro bundle. The race (rapid watchlist switching leaving the
 * chart stuck on the previous symbol) lives inside the vendor's SolidJS
 * createEffect that loads history + subscribes:
 *
 *   1. The effect must read symbol/period BEFORE the `a` loading lock check,
 *      so Solid tracks those signals even while a previous load is in flight
 *      (otherwise a `setSymbol` during loading is never re-triggered).
 *   2. After a load completes it must compare the current selection against
 *      the one it just loaded and force a reload (last-request-wins).
 *
 * These guards fail if a vendor upgrade re-introduces the original bug.
 */
describe("vendored klinecharts-pro symbol-switch race fix", () => {
  const src = fs.readFileSync(distPath, "utf8");

  it("reads symbol/period before the loading-guard return", () => {
    // Original buggy shape: `if (!a) { ...; const f = d(), v = L(); ... }`
    // Fixed shape: `const f = d(), v = L(); if (!a) { ... }`
    const loadIdx = src.indexOf("n == null || n.applyNewData(X, X.length > 0)");
    expect(loadIdx).toBeGreaterThan(-1);
    const effectHead = src.slice(loadIdx - 900, loadIdx);
    const reads = effectHead.lastIndexOf("const f = d(), v = L();");
    const guard = effectHead.lastIndexOf("if (!a) {");
    expect(reads).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    // the read must appear BEFORE the guard (fixed), not after (buggy)
    expect(reads).toBeLessThan(guard);
  });

  it("reloads when the selection changed during the load (last-request-wins)", () => {
    const loadIdx = src.indexOf("n == null || n.applyNewData(X, X.length > 0)");
    const afterLoad = src.slice(loadIdx, loadIdx + 600);
    expect(afterLoad).toContain("a = !1, k(!1)");
    // after clearing the lock the fixed code compares current vs loaded target
    expect(afterLoad).toMatch(/const cf = d\(\), cv = L\(\);/);
    expect(afterLoad).toMatch(/cf\.ticker !== f\.ticker/);
    // and forces a reload via the symbol setter (p) with a fresh object
    expect(afterLoad).toMatch(/p\(\{ \.\.\.cf \}\)/);
  });

  it("preserves the subscribe/updateData wiring", () => {
    const loadIdx = src.indexOf("n == null || n.applyNewData(X, X.length > 0)");
    const afterLoad = src.slice(loadIdx, loadIdx + 600);
    expect(afterLoad).toContain("e.datafeed.subscribe(f, v");
    expect(afterLoad).toContain("n.updateData(f1)");
    expect(afterLoad).toContain("n.applyNewData(X, X.length > 0)");
  });

  it("does not drop switches while a load is in flight", () => {
    // The fix must NOT have removed the loading lock; `a` still guards
    // concurrent loads. Instead it reads deps before the guard so a switch
    // during loading still re-triggers the effect, and reloads afterwards.
    const loadIdx = src.indexOf("n == null || n.applyNewData(X, X.length > 0)");
    const effectHead = src.slice(loadIdx - 900, loadIdx);
    expect(effectHead).toMatch(/if \(!a\) \{/); // lock preserved
    expect(effectHead).toMatch(/const f = d\(\), v = L\(\);/); // deps read before lock
    // effect still returns the loaded symbol/period tuple
    expect(src.slice(loadIdx, loadIdx + 500)).toContain("symbol: f");
  });
});
