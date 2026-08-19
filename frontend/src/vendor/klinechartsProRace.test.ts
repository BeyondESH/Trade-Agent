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
 *   1. The effect must read symbol/period BEFORE the loading-lock check, so
 *      Solid tracks those signals even while a previous load is in flight
 *      (otherwise a `setSymbol` during loading is never re-triggered).
 *   2. After a load completes it must compare the current selection against
 *      the one it just loaded and force a reload (last-request-wins).
 *
 * Assertions target stable string literals that survive minification, not the
 * minifier's chosen identifier names, so they survive innocent rebuilds and
 * still fail if a vendor change re-introduces the original bug.
 */
describe("vendored klinecharts-pro symbol-switch race fix", () => {
  const src = fs.readFileSync(distPath, "utf8");

  // `applyNewData` appears exactly once inside the loading effect. Anchor on it
  // (a stable string literal) and step back to the getHistoryKLineData call
  // that feeds it. Minifier variable names are ignored on purpose.
  const applyIdx = src.indexOf("applyNewData(");
  const allDataIdx = src.lastIndexOf("> 0");
  const loadAt = src.indexOf("getHistoryKLineData(", applyIdx - 400);
  const before = () => src.slice(Math.max(0, loadAt - 700), loadAt);
  const after = () => src.slice(loadAt, loadAt + 1300);

  it("bundle contains the datafeed load path", () => {
    expect(applyIdx).toBeGreaterThan(-1);
    expect(allDataIdx).toBeGreaterThan(-1);
    expect(loadAt).toBeGreaterThan(-1);
  });

  it("reads symbol/period before the loading-guard return", () => {
    // Just before the load, the effect reads both selection signals as a tuple
    // (e.g. `const g = c(), _ = $();` before `return a ? h : (... load ...)`).
    // This is what makes Solid track them even mid-load.
    const head = before();
    expect(head).toMatch(
      /const [a-zA-Z_$][\w$]* = [a-zA-Z_$][\w$]*\(\),\s*[a-zA-Z_$][\w$]* = [a-zA-Z_$][\w$]*\(\);\s*return [a-zA-Z_$][\w$]* \? /,
    );
  });

  it("reloads when the selection changed during the load (last-request-wins)", () => {
    // After applyNewData/subscribe it re-reads the selection and, if the symbol
    // ticker or period text changed, recreates the object to force a reload.
    const tail = after();
    expect(tail).toMatch(/\.ticker !== .*\.ticker/);
    expect(tail).toMatch(/\.text !== .*/);
    expect(tail).toMatch(/\{\s*\.\.\./);
  });

  it("preserves the subscribe/updateData wiring", () => {
    const tail = after();
    expect(tail).toMatch(/datafeed\.subscribe\([a-zA-Z_$][\w$]*, [a-zA-Z_$][\w$]*/);
    expect(tail).toMatch(/updateData\(/);
    expect(tail).toMatch(/applyNewData\([a-zA-Z_$][\w$]*, [a-zA-Z_$][\w$]*\.length > 0\)/);
  });

  it("keeps the loading lock so concurrent loads coalesce", () => {
    const head = before();
    // The effect is guarded by a truthy loading flag returning the prior state.
    expect(head).toMatch(/return [a-zA-Z_$][\w$]* \? [a-zA-Z_$][\w$]* : \(/);
    // It returns the loaded selection tuple as its prev value.
    const tail = after();
    expect(tail).toMatch(/symbol: [a-zA-Z_$][\w$]*/);
    expect(tail).toMatch(/period: [a-zA-Z_$][\w$]*/);
  });
});
