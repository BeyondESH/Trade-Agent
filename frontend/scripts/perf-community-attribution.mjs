// Attribution harness for the `community` view transition stall
// (frontend-performance-budgets tasks 8.1/8.2).
//
// It answers, with raw Chrome trace evidence rather than a hypothesis:
//   1. Does the recorded ~155 ms community transition reproduce?
//   2. If a stall occurs, which phase owns it (script / style / layout /
//      paint / GC / callback) and which JS function?
//   3. Is the cost community-specific or shared across views?
//
// Method: Playwright drives a real Chromium against the production preview.
// Every switch is delimited by a `performance.mark`, so the CDP trace can be
// sliced per switch and per view. The rAF frame-gap probe gives the visible
// symptom (max frame gap); the trace gives the cause.
//
// Measurement-only — it never edits the app.
//
// Usage: cd frontend && node scripts/perf-community-attribution.mjs
// Env:   PERF_URL       default http://127.0.0.1:4173
//        PERF_ROUNDS    default 6
//        PERF_VIEWS     default "markets,community,news"
import { chromium } from "playwright";

const url = process.env.PERF_URL ?? "http://127.0.0.1:4173";
const ALL_VIEWS = ["chart", "markets", "screener", "heatmaps", "community", "news", "research"];
const VIEWS = (process.env.PERF_VIEWS ?? "markets,community,news").split(",");
const ROUNDS = Number(process.env.PERF_ROUNDS ?? 6);
const DWELL = 800;
const round = (v) => Math.round(v * 100) / 100;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
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
  window.__markIdx = 0;
});
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

const nav = page.locator("#global-nav-rail button");
const client = await context.newCDPSession(page);
const events = [];
client.on("Tracing.dataCollected", ({ value }) => events.push(...value));
const done = new Promise((r) => client.on("Tracing.tracingComplete", () => r()));

const switches = []; // {view, maxGap}
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
    await page.evaluate(() => {
      performance.mark(`sw-${window.__markIdx}`);
      window.__markIdx += 1;
    });
    await nav.nth(i).click();
    await page.waitForTimeout(DWELL);
    const maxGap = await page.evaluate(() => {
      let m = 0;
      for (const g of window.__gaps) if (g.gap > m) m = g.gap;
      return Math.round(m * 100) / 100;
    });
    switches.push({ view: v, maxGap });
  }
}
await client.send("Tracing.end");
await done;

// --- main thread + marks ---------------------------------------------------
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

const marks = events
  .filter(
    (e) =>
      e.tid === mainTid &&
      e.ph === "X" &&
      e.name === "EventDispatch" &&
      e.args?.data?.type === "click",
  )
  .sort((a, b) => a.ts - b.ts)
  .map((e, i) => ({ ts: e.ts, idx: i }));

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
function phase(name) {
  if (/Script|FunctionCall|EvaluateScript|^v8|Compile|Optimize/.test(name)) return "script";
  if (/Layout|UpdateLayoutTree|RecalcStyle|Style/.test(name)) return "style/layout";
  if (/Paint|Composite|Raster|Draw|Layer|Decode/.test(name)) return "paint/composite";
  if (/GC|GarbageCollect/.test(name)) return "gc";
  if (/AnimationFrame|Timer|Microtask|EventDispatch|RequestAnimationFrame/.test(name))
    return "callback/timer";
  if (/Parse|HTML|Resource|Fetch|XHR|Loading|Commit/.test(name)) return "parse/load";
  return "other";
}

// Slice main-thread work per switch window [mark_i, mark_{i+1}).
const byView = {};
for (const v of VIEWS) byView[v] = { gaps: [], phase: {}, funcs: {} };
const markTs = marks.map((m) => m.ts);
for (let i = 0; i < markTs.length; i++) {
  const start = markTs[i];
  const end = markTs[i + 1] ?? start + DWELL * 1000;
  const sw = switches[i];
  if (!sw) continue;
  const bucket = byView[sw.view];
  bucket.gaps.push(sw.maxGap);
  for (const ev of main) {
    if (ev.ts < start || ev.ts >= end) continue;
    const p = phase(ev.name);
    bucket.phase[p] = (bucket.phase[p] ?? 0) + ev.dur;
    if (ev.fn) {
      const k = `${ev.fn} @ ${ev.url}:${ev.line}`;
      bucket.funcs[k] = (bucket.funcs[k] ?? 0) + ev.dur;
    }
  }
}

console.log(`=== 每视图切换最大帧间隔（${ROUNDS} 轮，1× CPU，未节流）===`);
for (const v of VIEWS) {
  const g = byView[v].gaps;
  const sorted = [...g].sort((a, b) => a - b);
  console.log(
    `  ${v.padEnd(11)} n=${g.length}  min ${sorted[0]}  median ${sorted[Math.floor(g.length / 2)]}  max ${sorted.at(-1)}`,
  );
  console.log(`              各轮: ${g.join(" ")}`);
}

console.log("\n=== 每视图每次切换的 trace 主线程耗时（ms/次，inclusive 近似）===");
const phases = [
  "script",
  "style/layout",
  "paint/composite",
  "gc",
  "callback/timer",
  "parse/load",
  "other",
];
console.log(`  ${"view".padEnd(12)} ${phases.map((p) => p.padStart(14)).join("")}`);
for (const v of VIEWS) {
  const n = byView[v].gaps.length || 1;
  console.log(
    `  ${v.padEnd(12)} ${phases
      .map((p) =>
        round((byView[v].phase[p] ?? 0) / 1000 / n)
          .toString()
          .padStart(14),
      )
      .join("")}`,
  );
}

console.log("\n=== 每视图 top JS 函数（inclusive，前 6）===");
for (const v of VIEWS) {
  const top = Object.entries(byView[v].funcs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  console.log(`  [${v}]`);
  for (const [k, us] of top)
    console.log(
      `    ${round(us / 1000)
        .toString()
        .padStart(7)} ms  ${k}`,
    );
}

const worst = roots.reduce((a, b) => (b.dur > a.dur ? b : a), roots[0] ?? { dur: 0, name: "-" });
console.log(
  `\n整段 trace 最长任务: ${round(worst.dur / 1000)} ms ${worst.name}${worst.fn ? ` · ${worst.fn}` : ""}`,
);

await browser.close();
