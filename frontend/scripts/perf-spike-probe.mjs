// One-off soak probe: find the source of the sporadic long frames that appear
// during view transitions (frontend-performance-budgets task 8.1).
//
// Context: the recorded "community 155 ms" does not reproduce — community is
// consistently 20-32 ms, while OTHER views sporadically spike to 55-144 ms.
// This probe cycles every view repeatedly under a single CDP trace and reports
// every task longer than 25 ms together with the JS function that ran it.
//
// Usage: cd frontend && node scripts/perf-spike-probe.mjs
// Env:   PERF_URL (default http://127.0.0.1:4173), PERF_ROUNDS (default 3)
import { chromium } from "playwright";

const url = process.env.PERF_URL ?? "http://127.0.0.1:4173";
const ALL_VIEWS = ["chart", "markets", "screener", "heatmaps", "community", "news", "research"];
const VIEWS = process.env.PERF_VIEWS ? process.env.PERF_VIEWS.split(",") : ALL_VIEWS;
const ROUNDS = Number(process.env.PERF_ROUNDS ?? 3);
const REDUCE = process.env.PERF_REDUCE === "1";
const DWELL = 650;
const round = (v) => Math.round(v * 100) / 100;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1680, height: 1000 },
  ...(REDUCE ? { reducedMotion: "reduce" } : {}),
});
console.log(
  `prefers-reduced-motion: ${REDUCE ? "reduce" : "no-preference"}；视图 ${VIEWS.join(",")} × ${ROUNDS} 轮`,
);
const page = await context.newPage();
await page.addInitScript(() => {
  window.__gaps = [];
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    window.__gaps.push({ t: now, gap: now - last });
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

const nav = page.locator("#global-nav-rail button");
const client = await context.newCDPSession(page);
const events = [];
client.on("Tracing.dataCollected", ({ value }) => events.push(...value));
const done = new Promise((r) => client.on("Tracing.tracingComplete", () => r()));

const perView = {};
for (const v of VIEWS) perView[v] = [];

await client.send("Tracing.start", {
  categories: "devtools.timeline,v8,blink.user_timing",
  transferMode: "ReportEvents",
});

for (let r = 0; r < ROUNDS; r++) {
  for (const v of VIEWS) {
    const i = ALL_VIEWS.indexOf(v);
    await page.evaluate(() => {
      window.__gaps = [];
    });
    await nav.nth(i).click();
    await page.waitForTimeout(DWELL);
    const max = await page.evaluate(() => {
      let m = 0;
      for (const g of window.__gaps) if (g.gap > m) m = g.gap;
      return Math.round(m * 100) / 100;
    });
    perView[v].push(max);
  }
}
await client.send("Tracing.end");
await done;

console.log("=== 每视图切换最大帧间隔（每轮）===");
for (const v of VIEWS)
  console.log(`  ${v.padEnd(12)} ${perView[v].map((n) => String(n).padStart(7)).join(" ")}`);

// --- main thread -----------------------------------------------------------
const threadNames = new Map();
for (const e of events)
  if (e.ph === "M" && e.name === "thread_name") threadNames.set(e.tid, e.args?.name ?? "");
const score = new Map();
for (const e of events)
  if (e.ph === "X" && typeof e.dur === "number") score.set(e.tid, (score.get(e.tid) ?? 0) + e.dur);
let mainTid = -1;
let best = -1;
for (const [tid, s] of score)
  if (/main/i.test(threadNames.get(tid) ?? "") && s > best) [mainTid, best] = [tid, s];

const main = events
  .filter((e) => e.tid === mainTid && e.ph === "X" && typeof e.dur === "number" && e.dur > 0)
  .map((e) => ({
    name: e.name,
    ts: e.ts,
    dur: e.dur,
    fn: e.args?.data?.functionName,
    url: (e.args?.data?.url ?? "").replace(/^https?:\/\/127\.0\.0\.1:4173/, ""),
    line: e.args?.data?.lineNumber,
  }))
  .sort((a, b) => a.ts - b.ts || b.dur - a.dur);

const roots = [];
const stack = [];
for (const ev of main) {
  const end = ev.ts + ev.dur;
  while (stack.length && stack[stack.length - 1].end <= ev.ts) stack.pop();
  const node = { ...ev, end, children: [] };
  if (stack.length) stack[stack.length - 1].node.children.push(node);
  else roots.push(node);
  stack.push({ end, node });
}

const spans = roots.filter((r) => r.dur / 1000 > 25).sort((a, b) => b.dur - a.dur);
console.log(`\n=== 顶层任务 > 25 ms（共 ${spans.length}）===`);
const printDeep = (n, depth, budget) => {
  if (budget.left-- <= 0 || depth > 5 || n.dur / 1000 < 0.5) return;
  const label = n.fn ? `${n.name} · ${n.fn}` : n.name;
  console.log(`  ${"  ".repeat(depth)}${round(n.dur / 1000)}ms ${label}`);
  for (const c of [...n.children].sort((a, b) => b.dur - a.dur)) printDeep(c, depth + 1, budget);
};
for (const s of spans.slice(0, 6)) {
  printDeep(s, 0, { left: 30 });
  console.log("  ---");
}

const byFn = {};
for (const n of main) {
  if (!n.fn) continue;
  const k = `${n.fn} @ ${n.url}:${n.line}`;
  byFn[k] = (byFn[k] ?? 0) + n.dur;
}
console.log("\n=== 具名 JS 函数（含子调用，前 20）===");
for (const [k, us] of Object.entries(byFn)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)) {
  console.log(
    `  ${round(us / 1000)
      .toString()
      .padStart(8)} ms  ${k}`,
  );
}

await browser.close();
