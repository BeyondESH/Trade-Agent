// CLS audit with TRUSTED input + digit-count width probe.
//
// Why this exists (frontend-performance-budgets task 4.2):
//   The only prior interaction-CLS reading (0.0869) came from an in-page
//   `element.click()`, which Chrome classifies as an UNTRUSTED event and does
//   NOT count as user input - so that reading may be inflated. Playwright's
//   `page.click()` dispatches real input over CDP and IS trusted, so it is the
//   only honest way to re-measure interaction CLS.
//
//   It also probes whether a numeric unit's box width is content-driven: it
//   clones a numeric unit off-screen and measures its width for a short value
//   (`+0.05%`) vs a longer one (`+12.34%`). A non-zero delta means the unit has
//   no reserved width and can displace its neighbours - the exact defect the
//   `webfont-self-hosting` delta calls out (tabular-nums aligns glyphs, not
//   digit count).
//
// Uses the PRODUCTION preview (vite preview), never vite dev (protocol §2).
//
// Usage: cd frontend && node scripts/cls-audit.mjs
// Env:
//   PERF_URL       被测地址，默认 http://127.0.0.1:4173
//   PERF_BACKEND   后端地址，默认 http://127.0.0.1:8181
import { chromium } from "playwright";

const url = process.env.PERF_URL ?? "http://127.0.0.1:4173";
const backend = process.env.PERF_BACKEND ?? "http://127.0.0.1:8181";

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

/** WebSocket hook so we can prove the app is in a data-flowing state. */
const wsHook = () => {
  const stats = { opens: 0, msgs: 0, bytes: 0 };
  window.__wsStats = stats;
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(...args) {
      super(...args);
      stats.opens += 1;
      this.addEventListener("message", (e) => {
        stats.msgs += 1;
        stats.bytes += typeof e.data === "string" ? e.data.length : 0;
      });
    }
  };
};

/** Install the layout-shift observer before any app script runs. */
const clsHook = () => {
  window.__cls = { total: 0, entries: [], supported: false };
  const describe = (node) => {
    if (node?.nodeType !== 1) return "(non-element)";
    const el = node;
    const id = el.id ? `#${el.id}` : "";
    const cls =
      typeof el.className === "string" && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
        : "";
    const txt = (el.textContent || "").trim().slice(0, 24);
    return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` "${txt}"` : ""}`;
  };
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__cls.total += entry.value;
        window.__cls.entries.push({
          value: Math.round(entry.value * 10000) / 10000,
          t: Math.round(entry.startTime),
          sources: (entry.sources ?? []).map((s) => ({
            node: describe(s.node),
            prev: s.previousRect
              ? { x: Math.round(s.previousRect.x), y: Math.round(s.previousRect.y) }
              : null,
            cur: s.currentRect
              ? { x: Math.round(s.currentRect.x), y: Math.round(s.currentRect.y) }
              : null,
          })),
        });
      }
    });
    po.observe({ type: "layout-shift", buffered: true });
    window.__cls.supported = true;
  } catch (e) {
    window.__clsError = String(e);
  }
};

/** Measure a numeric unit's box width for two digit-count variants (non-destructive). */
const widthProbe = () => {
  const SHORT = "+0.05%";
  const LONG = "+12.34%";
  const measure = (el, text) => {
    const clone = el.cloneNode(true);
    clone.style.position = "fixed";
    clone.style.left = "-99999px";
    clone.style.top = "0";
    clone.style.visibility = "hidden";
    clone.style.width = "auto";
    clone.style.maxWidth = "none";
    document.body.appendChild(clone);
    const textNodes = Array.from(clone.childNodes).filter((n) => n.nodeType === 3);
    if (textNodes.length === 0) {
      document.body.removeChild(clone);
      return null;
    }
    // Elements like `{sign}{number}%` split the value across two text nodes.
    // Put the whole probe string in the first and blank the rest, so the
    // measured width reflects one value, not a doubled one.
    textNodes.forEach((n, i) => {
      n.textContent = i === 0 ? text : "";
    });
    const w = clone.getBoundingClientRect().width;
    document.body.removeChild(clone);
    return w;
  };
  const label = (el) => {
    const cls = typeof el.className === "string" ? el.className.trim() : "";
    return `${el.tagName.toLowerCase()} .${cls.split(/\s+/).slice(0, 4).join(".")}`;
  };
  const seen = new Set();
  const findings = [];
  for (const el of document.querySelectorAll(".ta-num")) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 6) continue;
    const text = (el.textContent || "").trim();
    if (!/[\d]/.test(text) || text.length > 20) continue;
    const cs = getComputedStyle(el);
    if (cs.display !== "inline-flex" && cs.display !== "inline" && el.children.length > 0) {
      // Only probe content-sized units; skip table cells / block columns.
      if (cs.display !== "inline-flex") continue;
    }
    const short = measure(el, SHORT);
    const long = measure(el, LONG);
    if (short == null || long == null) continue;
    const delta = Math.round((long - short) * 100) / 100;
    if (Math.abs(delta) < 0.5) continue;
    const key = `${label(el)}|${Math.round(delta)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ node: label(el), sample: text.slice(0, 16), short, long, delta });
  }
  return findings;
};

const domCount = () => document.querySelectorAll("*").length;

/**
 * Does a table's percentage column move when the value gains a digit?
 * Auto-layout tables size columns to their widest cell, so a digit-count change
 * in one row can widen the column and shove every other column sideways.
 * Swaps only the `%` cells for the spec's longer example (`+0.05%` -> `+12.34%`),
 * reads a sample row's column widths, then restores the markup (innerHTML, so
 * child spans survive).
 */
const tableProbe = () => {
  const table = document.querySelector("table.w-full");
  if (!table) return { error: "no table" };
  const sampleRow = table.querySelector("tbody tr");
  if (!sampleRow) return { error: "no rows" };
  const colW = () =>
    Array.from(sampleRow.children).map((td) => Math.round(td.getBoundingClientRect().width));
  const before = colW();
  const restore = [];
  for (const tr of table.querySelectorAll("tbody tr")) {
    for (const td of Array.from(tr.children)) {
      if (!(td.textContent || "").includes("%")) continue;
      restore.push([td, td.innerHTML]);
      td.textContent = "+12.34%";
    }
  }
  if (restore.length === 0) return { before, after: before, delta: before.map(() => 0) };
  const after = colW();
  for (const [td, html] of restore) td.innerHTML = html;
  return { before, after, delta: before.map((w, i) => after[i] - w) };
};

const round = (v) => Math.round(v * 100) / 100;

// ---- Precondition: backend reachable -------------------------------------
try {
  const res = await fetch(`${backend}/health`);
  if (!res.ok) throw new Error(`/health -> ${res.status}`);
  console.log(`✓ 后端可达 ${backend}/health`);
} catch (err) {
  console.error(`\n✗ 前置条件不满足：后端不可达（${err.message}）。测量中止。`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).split("\n")[0].slice(0, 120)));
await page.addInitScript(wsHook);
await page.addInitScript(clsHook);

await page.goto(url, { waitUntil: "domcontentloaded" });

// ---- Precondition: quotes are actually flowing ---------------------------
let delivered = false;
for (let i = 0; i < 100; i++) {
  delivered = await page.evaluate(() => (window.__wsStats?.msgs ?? 0) > 0);
  if (delivered) break;
  await page.waitForTimeout(200);
}
if (!delivered) {
  console.error("\n✗ 前置条件不满足：WebSocket 未收到消息（空态）。测量中止。");
  await browser.close();
  process.exit(1);
}

// Let the app settle into steady state before driving it (protocol §5).
await page.waitForTimeout(4000);

// ---- Probe before any interaction (deterministic, per-unit) --------------
const probeBefore = await page.evaluate(widthProbe);
const domChart = await page.evaluate(domCount);

// ---- Drive with TRUSTED clicks -------------------------------------------
const nav = page.locator("#global-nav-rail button");
const navCount = await nav.count();
for (let i = 0; i < VIEWS.length && i < navCount; i++) {
  await nav.nth(i).click();
  await page.waitForTimeout(1500);
}
// Dock panels (trusted clicks) - exercise numeric panels (watchlist, orderbook).
for (const id of DOCKS) {
  const tab = page.locator(`#right-tab-${id}`);
  if ((await tab.count()) > 0) {
    await tab.click();
    await page.waitForTimeout(700);
  }
}
// Return to chart and dwell, letting live quotes mutate numeric units.
await nav.nth(0).click();
await page.waitForTimeout(3000);
await page.waitForTimeout(3000);

// ---- Table column stability (markets = 1, screener = 2) ------------------
const tableReports = [];
for (const [name, idx] of [
  ["markets", 1],
  ["screener", 2],
]) {
  if (idx >= navCount) continue;
  await nav.nth(idx).click();
  await page.waitForTimeout(2200);
  tableReports.push({ name, ...(await page.evaluate(tableProbe)) });
}
await nav.nth(0).click();
await page.waitForTimeout(800);

// ---- Collect -------------------------------------------------------------
const wsAfter = await page.evaluate(() => ({ ...window.__wsStats }));
const cls = await page.evaluate(() => JSON.parse(JSON.stringify(window.__cls)));
const clsError = await page.evaluate(() => window.__clsError ?? null);
const probeAfter = await page.evaluate(widthProbe);
const domEnd = await page.evaluate(domCount);
await browser.close();

console.log(`\n=== 前置条件 / 元数据 ===`);
console.log(`产物标识        ${url}`);
console.log(`WS 消息数       ${wsAfter.msgs}（连接 ${wsAfter.opens}，字节 ${wsAfter.bytes}）`);
console.log(`取样方式        Playwright 可信点击驱动全部视图 + 8 停靠栏`);
console.log(`观察窗口        ~${VIEWS.length * 1.5 + DOCKS.length * 0.7 + 6}s 交互 + 6s 稳态驻留`);
console.log(`layout-shift 支持 ${cls.supported}${clsError ? `（错误 ${clsError}）` : ""}`);

console.log(`\n=== CLS（可信输入）===`);
console.log(`总 CLS          ${round(cls.total)}`);
if (cls.entries.length === 0) {
  console.log(`布局位移条目    0（未观测到任何非输入触发的布局位移）`);
} else {
  for (const e of cls.entries) {
    console.log(`  +${e.value}  t=${e.t}ms`);
    for (const s of e.sources) {
      console.log(`      ${s.node}  ${JSON.stringify(s.prev)} -> ${JSON.stringify(s.cur)}`);
    }
  }
}

console.log(`\n=== 位数宽度探针（+0.05% vs +12.34%，克隆测量）===`);
console.log(`探测前发现    ${probeBefore.length} 个宽度随位数变化的数值单元`);
for (const f of probeBefore) {
  console.log(`  Δ${f.delta}px  ${f.node}  "${f.sample}"  (${round(f.short)} -> ${round(f.long)})`);
}
console.log(`探测后发现    ${probeAfter.length} 个宽度随位数变化的数值单元`);

console.log(`\n=== 表格列宽稳定性（数值单元换成更长值）===`);
for (const r of tableReports) {
  if (r.error) {
    console.log(`  [${r.name}] ${r.error}`);
    continue;
  }
  const moved = r.delta.filter((d) => Math.abs(d) > 0.5);
  console.log(
    `  [${r.name}] 列宽变化 ${moved.length ? r.delta.join(", ") : "0（列宽未随位数变化）"}`,
  );
}

console.log(`\n=== DOM ===`);
console.log(`chart 稳态 ${domChart} → 交错浏览后 ${domEnd}`);
console.log(`页面错误    ${pageErrors.length ? pageErrors.join(" | ") : "none"}`);
