// Sticky-DOM attribution (frontend-performance-budgets task 5.1).
//
// The measured symptom: on a fresh chart view the DOM is ~701 elements; after
// browsing every view and returning to the chart it settles ~1,072 (+51%) and
// does not fall back. Heap over 12 cycles is sawtooth (GC reclaiming), so there
// is no leak evidence — the question is whether the residue is an intentional
// cache or a missed unmount (design.md D6: classify BEFORE fixing).
//
// This bisects the residue to a concrete view / dock panel by:
//   chart0 -> [view V] -> chart -> count   (one view at a time, cumulative)
// then the same for each right-dock panel, and reports which step moved the DOM.
//
// Uses the production preview. Preconditions: backend reachable + WS delivering.
// Usage: cd frontend && node scripts/dom-bisect.mjs
// Env: PERF_URL (default http://127.0.0.1:4173), PERF_BACKEND (default :8181)
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

const wsHook = () => {
  const stats = { opens: 0, msgs: 0 };
  window.__wsStats = stats;
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(...a) {
      super(...a);
      stats.opens += 1;
      this.addEventListener("message", () => {
        stats.msgs += 1;
      });
    }
  };
};

try {
  const res = await fetch(`${backend}/health`);
  if (!res.ok) throw new Error(`/health -> ${res.status}`);
} catch (err) {
  console.error(`\n✗ 后端不可达（${err.message}）。测量中止。`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
await page.addInitScript(wsHook);
await page.goto(url, { waitUntil: "domcontentloaded" });

let delivered = false;
for (let i = 0; i < 100; i++) {
  delivered = await page.evaluate(() => (window.__wsStats?.msgs ?? 0) > 0);
  if (delivered) break;
  await page.waitForTimeout(200);
}
if (!delivered) {
  console.error("\n✗ WebSocket 未收到消息（空态）。测量中止。");
  await browser.close();
  process.exit(1);
}

const count = () => page.evaluate(() => document.querySelectorAll("*").length);
// The title bar grows a tab per distinct view first visited (intentional cache).
const tabCount = () => page.evaluate(() => document.querySelectorAll("[data-tab-id]").length);
// Split the DOM so the residue can be attributed to the title bar (tabs) vs the
// workspace (view) — the two candidates for "sticky DOM".
const barCount = () =>
  page.evaluate(
    () => document.querySelector("#trade-agent-titlebar")?.querySelectorAll("*").length ?? -1,
  );
const mainCount = () =>
  page.evaluate(() => document.querySelector("main")?.querySelectorAll("*").length ?? -1);

await page.waitForTimeout(6000); // steady state

const nav = page.locator("#global-nav-rail button");
const navCount = await nav.count();

const chart0 = await count();
const tabs0 = await tabCount();
const bar0 = await barCount();
const main0 = await mainCount();
console.log(
  `chart 稳态基线 DOM = ${chart0}（标题栏 ${bar0} + 工作区 ${main0}），tab 数 = ${tabs0}`,
);

console.log(`\n=== 逐视图残留（chart -> 视图 -> chart）===`);
const viewSteps = [];
for (let i = 1; i < VIEWS.length && i < navCount; i++) {
  await nav.nth(i).click();
  await page.waitForTimeout(2500);
  const onView = await count();
  await nav.nth(0).click();
  await page.waitForTimeout(1800);
  const back = await count();
  const backBar = await barCount();
  const backMain = await mainCount();
  viewSteps.push({ view: VIEWS[i], onView, back });
  console.log(
    `  ${VIEWS[i].padEnd(10)} 在视图 ${String(onView).padStart(5)}  回到 chart ${String(back).padStart(5)}  ΔDOM ${String(back - chart0).padStart(3)}（标题栏 ${backBar - bar0 >= 0 ? "+" : ""}${backBar - bar0}，工作区 ${backMain - main0 >= 0 ? "+" : ""}${backMain - main0}）`,
  );
}

console.log(`\n=== 逐停靠栏面板残留（chart 上切换面板）===`);
for (const id of DOCKS) {
  const tab = page.locator(`#right-tab-${id}`);
  if ((await tab.count()) === 0) continue;
  await tab.click();
  await page.waitForTimeout(900);
  await page.locator("#right-tab-watchlist").click();
  await page.waitForTimeout(900);
  const back = await count();
  console.log(
    `  ${id.padEnd(12)} 回到 watchlist ${String(back).padStart(5)}  Δ${back - chart0 >= 0 ? "+" : ""}${back - chart0}`,
  );
}

const finalDom = await count();
const finalTabs = await tabCount();
const finalBar = await barCount();
const finalMain = await mainCount();
console.log(`\n=== 汇总 ===`);
console.log(
  `chart 基线 ${chart0}（标题栏 ${bar0} + 工作区 ${main0}，tab ${tabs0}） → 浏览后 ${finalDom}（标题栏 ${finalBar} + 工作区 ${finalMain}，tab ${finalTabs}）`,
);
console.log(
  `残留归属：标题栏 ${finalBar - bar0}，工作区 ${finalMain - main0}，tab ${finalTabs - tabs0}`,
);

await browser.close();
