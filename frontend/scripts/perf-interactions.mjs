// Steady-state interaction measurements (frontend-performance-budgets tasks
// 2.3 and 2.4).
//
// 2.3  chart zoom / pan / period switch  +  long-list scroll frame times
// 2.4  search-input typing latency, driven by Playwright *trusted* input
//      (CDP-dispatched real key events). In-page `element.click()` /
//      `dispatchEvent` are UNTRUSTED — Chrome does not count them as user
//      interaction — so they are deliberately NOT used here.
//
// All readings are STEADY-STATE (the app has finished loading and live WS data
// is flowing); the load phase is excluded per the protocol (docs §5).
//
// Usage: cd frontend && node scripts/perf-interactions.mjs
// Env:   PERF_URL  default http://127.0.0.1:4173
import { chromium } from "playwright";

const url = process.env.PERF_URL ?? "http://127.0.0.1:4173";
const round = (v) => Math.round(v * 100) / 100;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
const page = await context.newPage();

await page.addInitScript(() => {
  // rAF frame-gap probe (records into window.__gaps).
  window.__gaps = [];
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    window.__gaps.push(now - last);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // Event Timing API: durations of real input events (>= 16 ms only, Chrome
  // clamps the threshold). Used for the typing-latency reading.
  window.__events = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__events.push({
          name: e.name,
          duration: Math.round(e.duration * 100) / 100,
          processingStart: Math.round(e.processingStart * 100) / 100,
          startTime: Math.round(e.startTime * 100) / 100,
          interactionId: e.interactionId ?? 0,
        });
      }
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch {
    /* unsupported */
  }

  // Per-keystroke latency: time from keydown (capture) to the resulting input
  // event, measured in-page so tool round-trip is excluded.
  window.__keyLatency = [];
  window.addEventListener(
    "keydown",
    (e) => {
      window.__keyT0 = performance.now();
      window.__keyCode = e.key;
    },
    true,
  );
  window.addEventListener(
    "input",
    () => {
      if (typeof window.__keyT0 === "number") {
        window.__keyLatency.push({
          key: window.__keyCode,
          ms: Math.round((performance.now() - window.__keyT0) * 100) / 100,
        });
      }
    },
    true,
  );
});

const stats = (gaps) => {
  const s = [...gaps].sort((a, b) => a - b);
  return {
    n: s.length,
    min: round(s[0] ?? 0),
    median: round(s[Math.floor(s.length / 2)] ?? 0),
    p95: round(s[Math.floor(s.length * 0.95)] ?? 0),
    max: round(s.at(-1) ?? 0),
  };
};

/** Run `fn` while sampling frame gaps; return the gap stats for that window. */
async function withFrames(fn, settleMs = 500) {
  await page.evaluate(() => {
    window.__gaps = [];
  });
  await fn();
  await page.waitForTimeout(settleMs);
  const gaps = await page.evaluate(() => window.__gaps.slice());
  return stats(gaps);
}

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3800);

// ---- 2.3a chart zoom (wheel) ---------------------------------------------
const canvasBox = await page.locator("canvas").first().boundingBox();
const cx = canvasBox ? canvasBox.x + canvasBox.width / 2 : 600;
const cy = canvasBox ? canvasBox.y + canvasBox.height / 2 : 400;
await page.mouse.move(cx, cy);
const zoom = await withFrames(async () => {
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, i % 2 === 0 ? -120 : 120);
    await page.waitForTimeout(50);
  }
});

// ---- 2.3b chart pan (drag) -----------------------------------------------
await page.mouse.move(cx, cy);
const pan = await withFrames(async () => {
  await page.mouse.down();
  await page.mouse.move(cx - 320, cy, { steps: 24 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.mouse.move(cx + 320, cy, { steps: 24 });
  await page.mouse.up();
});

// ---- 2.3c period switch --------------------------------------------------
const periodItem = page.locator(".item.period");
const periodTexts = (await periodItem.allTextContents()).map((s) => s.trim()).filter(Boolean);
const period = await withFrames(async () => {
  for (const label of ["15m", "1h", "5m", "1h"]) {
    const item = page
      .locator(".item.period")
      .filter({ hasText: new RegExp(`^${label}$`) })
      .first();
    if ((await item.count()) === 0) continue;
    await item.click();
    await page.waitForTimeout(260);
  }
});

// ---- 2.3d long-list scroll (screener) ------------------------------------
const nav = page.locator("#global-nav-rail button");
await nav.nth(2).click(); // screener
await page.waitForTimeout(2200);
const scrollInfo = await page.evaluate(() => {
  let bestEl = null;
  for (const el of document.querySelectorAll("*")) {
    if (el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 200) {
      if (!bestEl || el.scrollHeight > bestEl.scrollHeight) bestEl = el;
    }
  }
  if (!bestEl) return null;
  const r = bestEl.getBoundingClientRect();
  return {
    scrollHeight: bestEl.scrollHeight,
    clientHeight: bestEl.clientHeight,
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
    tag: bestEl.tagName,
  };
});
let scroll = null;
if (scrollInfo) {
  await page.mouse.move(scrollInfo.x, scrollInfo.y);
  scroll = await withFrames(async () => {
    const steps = Math.ceil(scrollInfo.scrollHeight / 300);
    for (let i = 0; i < Math.min(steps, 40); i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(40);
    }
  });
}

// ---- 2.4 search-input typing latency (TRUSTED input) ---------------------
await nav.nth(6).click(); // research
await page.waitForTimeout(2200);
const input = page.locator('[data-testid="research-symbol-filter"]');
const hasInput = (await input.count()) > 0;
let typing = null;
let eventTiming = [];
if (hasInput) {
  await input.click(); // Playwright click = trusted CDP event
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.__keyLatency = [];
    window.__events = [];
  });
  // `pressSequentially` dispatches real key events through CDP (trusted).
  const t0 = Date.now();
  await input.pressSequentially("BTCUSDT", { delay: 70 });
  const wallMs = Date.now() - t0;
  await page.waitForTimeout(300);
  const lat = await page.evaluate(() => window.__keyLatency.slice());
  eventTiming = await page.evaluate(() => window.__events.slice());
  const ms = lat.map((l) => l.ms);
  typing = { ...stats(ms), keys: lat.length, wallMs };
}

// ---- Report --------------------------------------------------------------
const line = (label, s) =>
  s
    ? `  ${label.padEnd(22)} n=${String(s.n).padStart(3)}  min ${String(s.min).padStart(6)}  median ${String(s.median).padStart(6)}  p95 ${String(s.p95).padStart(6)}  max ${String(s.max).padStart(6)} ms`
    : `  ${label.padEnd(22)} (未测得)`;

console.log(`=== 2.3 稳态交互帧间隔（1× CPU，未节流，实时推送）===`);
console.log(line("chart 缩放 (wheel)", zoom));
console.log(line("chart 平移 (drag)", pan));
console.log(line("周期切换 (15m/1h/5m/1h)", period));
console.log(`  周期项: ${periodTexts.slice(0, 12).join(" ") || "(none)"}`);
if (scrollInfo)
  console.log(
    `  列表容器: ${scrollInfo.tag} scrollHeight=${scrollInfo.scrollHeight} clientHeight=${scrollInfo.clientHeight}`,
  );
console.log(line("列表滚动 (screener)", scroll));

console.log(`\n=== 2.4 搜索输入延迟（可信输入 / Playwright CDP key events）===`);
if (typing) {
  console.log(
    `  research-symbol-filter  按键 ${typing.keys} 次  keydown→input: median ${typing.median} ms / max ${typing.max} ms  (整个输入 ${typing.wallMs} ms)`,
  );
  console.log(`  Event Timing (duration ≥16ms)，按事件名聚合:`);
  const byName = {};
  for (const e of eventTiming) {
    if (!byName[e.name]) byName[e.name] = [];
    byName[e.name].push(e.duration);
  }
  for (const [name, ds] of Object.entries(byName)) {
    const s = [...ds].sort((a, b) => a - b);
    console.log(
      `    ${name.padEnd(12)} n=${String(s.length).padStart(3)}  median ${round(s[Math.floor(s.length / 2)])} ms  max ${round(s.at(-1))} ms`,
    );
  }
  if (eventTiming.length === 0) console.log("    （无 ≥16 ms 的事件）");
} else {
  console.log("  ✗ 未找到 research-symbol-filter，无法测量");
}

await browser.close();
