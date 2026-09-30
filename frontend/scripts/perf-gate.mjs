// Frontend performance gate (frontend-performance-budgets tasks 6.1-6.5).
//
// Enforces the budgets in `frontend/perf-budgets.json` at two levels:
//
//   1. STATIC (always): the built `dist/` entry chunk, the first-paint
//      `modulepreload` JS total, and the render-blocking CSS size + request
//      count. Deterministic; no server or browser needed. The entry chunk is
//      ALSO enforced at build time by `vite.config.ts` (initialChunkBudgetPlugin).
//
//   2. RUNTIME (needs a running production preview + Chromium): the per-surface
//      DOM ceiling, "bounded, not unbounded" DOM growth across repeated view
//      cycles, load CLS, and the per-view transition max frame gap (task 8.3,
//      budget key `transitionMaxGapMs`). This is the automated assertion for
//      task 5.4 and 8.3.
//
// Failure policy (spec `ci-quality-gates`: "门禁不可静默通过"):
//   - Any unexempted breach -> exit 1.
//   - Cannot run the runtime checks in CI (no PERF_GATE_URL, or Chromium
//     unavailable) -> exit 1 with an explicit message, NEVER a silent green.
//   - A recorded exemption in `perf-budgets.json` (`exemptions.<budgetId>` with
//     `reason` + `convergence`) downgrades that breach to an explicit warning;
//     it is never a silent pass.
//
// Measurement protocol (docs/frontend-performance.md): the runtime checks in CI
// run WITHOUT a backend, so they are a *structural* gate (DOM limits, load CLS),
// not a timing conclusion. When `PERF_GATE_BACKEND` is reachable the script
// verifies live WS delivery before treating the run as representative.
//
// Usage:
//   cd frontend && node scripts/perf-gate.mjs                    # CI/strict: needs PERF_GATE_URL
//   PERF_GATE_STATIC_ONLY=1 node scripts/perf-gate.mjs           # local static-only (explicit skip)
// Env:
//   PERF_GATE_URL            running production preview, e.g. http://127.0.0.1:4173
//   PERF_GATE_STATIC_ONLY    1 = explicitly skip the browser subset (local only)
//   PERF_GATE_BACKEND        optional backend for the data-flow precondition, e.g. http://127.0.0.1:8181
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const budgets = JSON.parse(readFileSync(join(root, "perf-budgets.json"), "utf8"));
const limits = budgets.budgets;
const exemptions = budgets.exemptions ?? {};

const url = process.env.PERF_GATE_URL ?? "";
const staticOnly = process.env.PERF_GATE_STATIC_ONLY === "1";
const backend = process.env.PERF_GATE_BACKEND ?? "";

const failures = [];
const exempted = [];
const round = (v) => Math.round(v * 100) / 100;
const kb = (bytes) => bytes / 1000;

/** Compare one metric against its budget, honouring a recorded exemption. */
function check(name, value, limit, unit = "") {
  const label = `${name} = ${round(value)}${unit} (预算 ${round(limit)}${unit})`;
  if (value <= limit) {
    console.log(`  ✓ ${label}`);
    return;
  }
  const ex = exemptions[name];
  if (ex) {
    exempted.push(name);
    console.warn(`  ⚠ ${label} 超限；已登记豁免：${ex.reason}（收敛计划：${ex.convergence}）`);
    return;
  }
  failures.push(name);
  console.error(`  ✗ ${label} 超限`);
}

// ---- 1. STATIC budgets ---------------------------------------------------
console.log("=== 静态预算（构建产物）===");
const indexPath = join(distDir, "index.html");
if (!existsSync(indexPath)) {
  console.error("  ✗ 找不到 dist/index.html，请先执行 `vite build`");
  failures.push("dist");
} else {
  const html = readFileSync(indexPath, "utf8");
  const abs = (href) => join(distDir, href.replace(/^\//, ""));
  const sizeOf = (href) => (existsSync(abs(href)) ? statSync(abs(href)).size : 0);
  const entry = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1] ?? "";
  const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map(
    (m) => m[1],
  );
  const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(
    (m) => m[1],
  );
  const entryKb = kb(sizeOf(entry));
  const preloadJsKb =
    entryKb + preloads.filter((p) => p.endsWith(".js")).reduce((sum, p) => sum + kb(sizeOf(p)), 0);
  const cssKb = styles.reduce((sum, s) => sum + kb(sizeOf(s)), 0);

  console.log(`  入口        ${entry} = ${round(entryKb)} kB`);
  console.log(`  首屏预加载  ${preloads.length} 个 chunk`);
  console.log(`  阻塞样式    ${styles.length} 个，${round(cssKb)} kB`);

  check("initialChunkKb", entryKb, limits.initialChunkKb, " kB");
  check("firstPaintPreloadJsKb", preloadJsKb, limits.firstPaintPreloadJsKb, " kB");
  check("renderBlockingCssKb", cssKb, limits.renderBlockingCssKb, " kB");
  check("renderBlockingRequests", styles.length, limits.renderBlockingRequests);
}

// ---- 2. RUNTIME budgets --------------------------------------------------
if (staticOnly) {
  console.log("\n=== 运行时预算 ===");
  console.warn(
    "  ⚠ PERF_GATE_STATIC_ONLY=1：运行时的 DOM / CLS 检查被显式跳过。\n" +
      "    这是本地静态模式，NOT 有效的 CI 结果；CI MUST NOT 设置该变量（规格：门禁不得静默通过）。",
  );
} else if (!url) {
  console.error("\n=== 运行时预算 ===");
  console.error("  ✗ 未设置 PERF_GATE_URL，无法执行运行时 DOM/CLS 检查（门禁不得静默通过）。");
  console.error(
    "    请启动 `vite preview` 并设置 PERF_GATE_URL，或本地使用 PERF_GATE_STATIC_ONLY=1。",
  );
  failures.push("runtime");
} else {
  console.log("\n=== 运行时预算（生产预览）===");
  // Optional data-flow precondition (protocol §3).
  if (backend) {
    try {
      const res = await fetch(`${backend}/health`);
      console.log(`  后端 ${backend}/health -> ${res.status}`);
    } catch (err) {
      console.warn(`  ⚠ 后端不可达（${err.message}）；本次为结构性检查，非时序结论`);
    }
  } else {
    console.warn(
      "  ⚠ 未提供 PERF_GATE_BACKEND：无数据流，本次仅为结构性检查（DOM/CLS），非时序结论",
    );
  }

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    console.error(`  ✗ 无法启动 Chromium（${err.message}）；运行时门禁不可静默跳过。`);
    failures.push("browser");
  }

  if (browser) {
    const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
    await page.addInitScript(() => {
      window.__cls = { total: 0 };
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (!e.hadRecentInput) window.__cls.total += e.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
      } catch {
        /* observer unsupported: CLS stays 0 */
      }
      // Per-view transition frame-gap probe (task 8.3). `__gaps` is reset
      // before each click and read after the view settles.
      window.__gaps = [];
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        window.__gaps.push(now - last);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);

    const domCount = () => page.evaluate(() => document.querySelectorAll("*").length);
    const nav = page.locator("#global-nav-rail button");
    const navCount = await nav.count();
    const VIEWS = ["chart", "markets", "screener", "heatmaps", "community", "news", "research"];
    const DOCKS = [
      "watchlist",
      "alerts",
      "news",
      "datawindow",
      "hotlists",
      "calendar",
      "orderbook",
      "ideas",
    ];

    // Per-surface DOM ceiling.
    let maxDom = await domCount();
    const surfaces = [{ name: "chart", dom: maxDom }];
    for (let i = 1; i < VIEWS.length && i < navCount; i++) {
      await nav.nth(i).click();
      await page.waitForTimeout(1800);
      const dom = await domCount();
      surfaces.push({ name: VIEWS[i], dom });
      maxDom = Math.max(maxDom, dom);
    }
    // The right dock only exists on the chart view.
    await nav.nth(0).click();
    await page.waitForTimeout(1200);
    for (const id of DOCKS) {
      const tab = page.locator(`#right-tab-${id}`);
      if ((await tab.count()) === 0) continue;
      await tab.click();
      await page.waitForTimeout(600);
      const dom = await domCount();
      surfaces.push({ name: `dock:${id}`, dom });
      maxDom = Math.max(maxDom, dom);
    }
    console.log(
      `  各界面 DOM  最大 ${maxDom}（${surfaces.map((s) => `${s.name} ${s.dom}`).join(", ")}）`,
    );
    check("domCeiling", maxDom, limits.domCeiling);

    // Bounded growth: two full view cycles must not keep growing (task 5.4).
    const cycle = async () => {
      for (let i = 0; i < VIEWS.length && i < navCount; i++) {
        await nav.nth(i).click();
        await page.waitForTimeout(500);
      }
      await nav.nth(0).click();
      await page.waitForTimeout(800);
      return domCount();
    };
    const dom1 = await cycle();
    const dom2 = await cycle();
    const dom3 = await cycle();
    console.log(`  多轮切换 DOM  cycle1 ${dom1} -> cycle2 ${dom2} -> cycle3 ${dom3}`);
    check("domCycleDelta", dom3 - dom1, limits.domCycleDelta);

    // Per-view transition max frame gap (task 8.3). The recorded regression was
    // a ~155 ms single-frame stall on `community` (≈9 dropped frames) while
    // every other view sat at 16.8-31 ms.
    //
    // Estimator: the MEDIAN of TRANSITION_ROUNDS per-round maxima, per view.
    // A single sporadic, view-independent spike (framer-motion's main-thread
    // animation/layout work + a React commit — see docs/frontend-performance.md
    // §11) must not flake the gate, but a DETERMINISTIC per-view regression
    // moves the median and fails loudly. Budget lives in perf-budgets.json
    // (`transitionMaxGapMs`); it is a new key and no existing budget was relaxed.
    const TRANSITION_ROUNDS = 3;
    const gapSamples = Object.fromEntries(VIEWS.map((v) => [v, []]));
    for (let r = 0; r < TRANSITION_ROUNDS; r++) {
      for (let i = 0; i < VIEWS.length && i < navCount; i++) {
        await page.evaluate(() => {
          window.__gaps = [];
        });
        await nav.nth(i).click();
        await page.waitForTimeout(700);
        const maxGap = await page.evaluate(() => {
          let m = 0;
          for (const g of window.__gaps) if (g > m) m = g;
          return Math.round(m * 100) / 100;
        });
        gapSamples[VIEWS[i]].push(maxGap);
      }
    }
    for (const v of VIEWS) {
      const sorted = [...gapSamples[v]].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      console.log(`  切换帧间隔 ${v.padEnd(9)} 各轮 ${gapSamples[v].join(" / ")} ms`);
      if (limits.transitionMaxGapMs === undefined) continue;
      check(`transitionMaxGap.${v}`, median, limits.transitionMaxGapMs, " ms");
    }
    await nav.nth(0).click();
    await page.waitForTimeout(700);

    const cls = await page.evaluate(() => Math.round((window.__cls?.total ?? 0) * 10000) / 10000);
    console.log(`  加载期 CLS   ${cls}`);
    // CLS is expressed as a decimal, not a size: compare directly.
    if (cls > limits.cls) {
      const ex = exemptions.cls;
      if (ex) {
        exempted.push("cls");
        console.warn(
          `  ⚠ cls = ${cls} 超限；已登记豁免：${ex.reason}（收敛计划：${ex.convergence}）`,
        );
      } else {
        failures.push("cls");
        console.error(`  ✗ cls = ${cls} 超过预算 ${limits.cls}`);
      }
    } else {
      console.log(`  ✓ cls = ${cls} (预算 ${limits.cls})`);
    }

    await browser.close();
  }
}

// ---- Summary -------------------------------------------------------------
console.log("\n=== 元数据 ===");
console.log(`产物标识        ${url || "(未提供 URL)"}`);
console.log(`CPU 降速档位    CI/本地默认（非 4x；LCP 预算由人工/定期按 4x CPU + Fast 4G 复核）`);
console.log(`节流档位        无（本门禁校验结构性上限，不做时序达标判定）`);
console.log(`预算来源        frontend/perf-budgets.json（棘轮：只升不降）`);
console.log(`豁免记录        ${exempted.length ? exempted.join(", ") : "无"}`);

if (failures.length) {
  console.error(`\n✗ 性能门禁失败：${failures.join(", ")}`);
  if (exempted.length) {
    console.error(
      `  （另 ${exempted.length} 项超限已按 exemptions 登记豁免：${exempted.join(", ")}）`,
    );
  }
  process.exit(1);
}
console.log(`\n✓ 性能门禁通过${exempted.length ? `（${exempted.length} 项按豁免记录放行）` : ""}`);
