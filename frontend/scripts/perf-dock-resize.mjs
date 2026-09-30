// Right-dock resize interaction measurement (defect: width-animated dock +
// per-mousemove width application; the chart canvas is left stale).
//
// Answers, with Playwright/Chromium against the production preview:
//   (i)   toggle  — how many times, and when relative to the click, does the
//                   chart canvas backing store change?
//   (ii)  drag    — does the chart canvas resize DURING the drag, and how many
//                   times?
//   (iii) frame   — rAF frame gaps during the toggle and drag windows.
//
// Method: an in-page rAF sampler records, per frame, the dock container width,
// the drawer wrapper width, the panel width, the chart widget width and the
// first chart <canvas> width (its backing store). Toggle/drag boundaries are
// marked by in-page listeners on the real (trusted, CDP-dispatched) events, so
// every timestamp shares one clock. Long tasks (>50 ms) are recorded via
// PerformanceObserver and reported per window.
//
// Usage: cd frontend && node scripts/perf-dock-resize.mjs
// Env:   PERF_URL  default http://127.0.0.1:4173
import { chromium } from "playwright";

const url = process.env.PERF_URL ?? "http://127.0.0.1:4173";
const round = (v) => Math.round(v * 100) / 100;
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

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 945 } });
const page = await context.newPage();
page.on("pageerror", (e) => console.error("[pageerror]", e.message));

await page.addInitScript(() => {
  // Browser-side helper (Node closures are NOT captured by addInitScript).
  const r2 = (v) => Math.round(v * 100) / 100;
  window.__dock = {
    on: false,
    t0: 0,
    samples: [],
    gaps: [],
    marks: {},
    moves: 0,
    longTasks: [],
  };
  window.__dockStart = () => {
    const d = window.__dock;
    d.on = true;
    d.gen = (d.gen ?? 0) + 1;
    const gen = d.gen;
    d.t0 = performance.now();
    d.samples = [];
    d.gaps = [];
    d.marks = {};
    d.moves = 0;
    d.longTasks = [];
    let last = d.t0;
    const canvasEl = document.querySelector("canvas");
    const panel = document.querySelector('[data-testid="right-dock-panel"]');
    const wrap = panel ? panel.parentElement : null;
    const dockEl = document.getElementById("tradingview-right-dock");
    const widget = (() => {
      let el = canvasEl;
      for (let i = 0; i < 6 && el; i++) {
        if (el.className && String(el.className).includes("klinecharts-pro-widget")) return el;
        el = el.parentElement;
      }
      return null;
    })();
    const tick = () => {
      const now = performance.now();
      d.gaps.push(now - last);
      last = now;
      d.samples.push({
        t: r2(now - d.t0),
        canvasW: canvasEl ? canvasEl.width : -1,
        canvasCW: canvasEl ? canvasEl.clientWidth : -1,
        widgetW: widget ? widget.clientWidth : -1,
        dockW: dockEl ? Math.round(dockEl.getBoundingClientRect().width) : -1,
        panelW: panel ? Math.round(panel.getBoundingClientRect().width) : -1,
        wrapW: wrap ? Math.round(wrap.getBoundingClientRect().width) : -1,
      });
      if (d.on && d.gen === gen) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  window.__dockStop = () => {
    window.__dock.on = false;
    return window.__dock;
  };
  const mark = (k) => {
    if (window.__dock.on) window.__dock.marks[k] = r2(performance.now() - window.__dock.t0);
  };
  document.addEventListener(
    "click",
    (e) => {
      if (e.target?.closest?.("#right-dock-collapse-toggle")) mark("toggleClick");
    },
    true,
  );
  window.addEventListener(
    "mousedown",
    (e) => {
      if (e.target?.closest?.('[data-testid="right-dock-resize-handle"]')) mark("dragDown");
    },
    true,
  );
  window.addEventListener(
    "mouseup",
    () => {
      if (window.__dock.on && window.__dock.marks.dragDown !== undefined)
        window.__dock.marks.dragUp = r2(performance.now() - window.__dock.t0);
    },
    true,
  );
  window.addEventListener(
    "mousemove",
    () => {
      if (window.__dock.on) window.__dock.moves++;
    },
    true,
  );
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__dock.longTasks.push({ start: r2(e.startTime), duration: r2(e.duration) });
      }
    }).observe({ type: "longtask", buffered: false });
  } catch {
    /* unsupported */
  }
});

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!window.__kline_chart__, null, { timeout: 30000 });
await page.waitForTimeout(3000); // steady state (live WS flowing)

/** Pull the sampler buffer and summarise one interaction window. */
async function collect(label) {
  const data = await page.evaluate(() => {
    const d = window.__dockStop();
    return {
      t0: d.t0,
      samples: d.samples,
      gaps: d.gaps,
      marks: d.marks,
      moves: d.moves,
      longTasks: d.longTasks,
    };
  });
  const { samples, marks, t0 } = data;
  const anchor = marks.toggleClick ?? marks.dragDown ?? 0;
  const end = marks.dragUp ?? anchor + (marks.toggleClick !== undefined ? 1200 : Infinity);
  const win = samples.filter((s) => s.t >= anchor && s.t <= end);
  const winGaps = [];
  for (let i = 1; i < win.length; i++) winGaps.push(win[i].t - win[i - 1].t);
  const canvasChanges = [];
  for (let i = 1; i < win.length; i++) {
    if (win[i].canvasW !== win[i - 1].canvasW) {
      canvasChanges.push({
        t: win[i].t,
        dtFromAnchor: round(win[i].t - anchor),
        from: win[i - 1].canvasW,
        to: win[i].canvasW,
        wrapW: win[i].wrapW,
        widgetW: win[i].widgetW,
      });
    }
  }
  // Independent staleness check: force a chart re-measure and see whether the
  // canvas backing store still moves. Moving = the chart had been left stale;
  // staying put = the canvas already matched its container.
  const forced = await page.evaluate(async () => {
    const c = document.querySelector("canvas");
    const before = c.width;
    window.__kline_chart__?.resize();
    await new Promise((r) => setTimeout(r, 150));
    return { before, after: c.width };
  });
  const out = {
    label,
    marks,
    moves: data.moves,
    samples: samples.length,
    windowSamples: win.length,
    start: {
      dockW: win[0]?.dockW,
      wrapW: win[0]?.wrapW,
      panelW: win[0]?.panelW,
      canvasW: win[0]?.canvasW,
      widgetW: win[0]?.widgetW,
    },
    end: {
      dockW: win.at(-1)?.dockW,
      wrapW: win.at(-1)?.wrapW,
      panelW: win.at(-1)?.panelW,
      canvasW: win.at(-1)?.canvasW,
      canvasCW: win.at(-1)?.canvasCW,
      widgetW: win.at(-1)?.widgetW,
    },
    canvasChanges,
    forcedResizeMovedPx: Math.abs(forced.after - forced.before),
    gaps: stats(winGaps),
    longTasks: data.longTasks
      .filter((lt) => lt.start >= t0 + anchor - 50 && lt.start <= t0 + end + 50)
      .map((lt) => ({ t: round(lt.start - t0), duration: lt.duration })),
  };
  console.log(JSON.stringify(out, null, 1));
  return out;
}

const toggle = page.locator("#right-dock-collapse-toggle");
const results = [];
const panelW = async () => {
  const b = await page.locator('[data-testid="right-dock-panel"]').boundingBox();
  return b ? Math.round(b.width) : -1;
};

/** Put the drawer back to the 260 px clamp so each drag round starts equal. */
async function resetWidth() {
  const handle = await page.locator('[data-testid="right-dock-resize-handle"]').boundingBox();
  const hx = handle.x + handle.width / 2;
  const hy = handle.y + handle.height / 2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + 600, hy, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

// ---- (i) TOGGLE: close, then open -----------------------------------------
console.log("=== (i) toggle: close (open -> collapsed) ===");
await page.evaluate(() => window.__dockStart());
await toggle.click();
await page.waitForTimeout(1200);
results.push(await collect("toggle-close"));

console.log("=== (i) toggle: open (collapsed -> open) ===");
await page.evaluate(() => window.__dockStart());
await toggle.click();
await page.waitForTimeout(1200);
results.push(await collect("toggle-open"));

// ---- (ii) DRAG: paced (≈120 Hz-ish) and burst ------------------------------
async function dragRound(label, steps, delayMs, resetFirst) {
  if (resetFirst) await resetWidth();
  const handle = await page.locator('[data-testid="right-dock-resize-handle"]').boundingBox();
  const hx = handle.x + handle.width / 2;
  const hy = handle.y + handle.height / 2;
  await page.evaluate(() => window.__dockStart());
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  // The live width readout only re-renders on a React commit, so counting its
  // text mutations during the drag counts commits (a proxy for setWidth calls).
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    window.__readout = { mutations: 0 };
    const el = document.querySelector("#tradingview-right-dock .ta-glass");
    if (el) {
      new MutationObserver((list) => {
        window.__readout.mutations += list.length;
      }).observe(el, { characterData: true, childList: true, subtree: true });
    }
  });
  const box = await page.locator('[data-testid="right-dock-resize-handle"]').boundingBox();
  const delta = 240; // left drag => wider (clamped at 500)
  if (delayMs > 0) {
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(box.x + box.width / 2 - (delta * i) / steps, hy);
      await page.waitForTimeout(delayMs);
    }
  } else {
    await page.mouse.move(box.x + box.width / 2 - delta, hy, { steps });
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const res = await collect(label);
  res.readoutMutations = await page.evaluate(() => window.__readout?.mutations ?? -1);
  return res;
}

const widthsBefore = await panelW();
results.push(await dragRound("drag-paced-60x6ms", 60, 6, true));
const widthsAfterPaced = await panelW();
results.push(await dragRound("drag-burst-240", 240, 0, true));
const widthsAfterBurst = await panelW();
await resetWidth();

// ---- (iv) coalescing probe: 20 mousemoves in SEPARATE tasks ---------------
// Each move lands in its own macrotask, so a per-event implementation commits
// once per move while a per-frame implementation commits at most once per rAF.
// The readout text only changes on a React commit, so its mutations count
// commits; `frames` counts the animation frames the moves span.
console.log("=== (iv) drag coalescing probe (20 moves, separate tasks) ===");
await resetWidth();
const coalesce = await page.evaluate(async () => {
  const panel = () => document.querySelector('[data-testid="right-dock-panel"]');
  const handle = document.querySelector('[data-testid="right-dock-resize-handle"]');
  const rect = handle.getBoundingClientRect();
  const x0 = rect.left + rect.width / 2;
  const y0 = rect.top + rect.height / 2;
  const fire = (type, x, y, target) => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        view: window,
      }),
    );
  };
  const res = { moves: 20, mutations: 0, frames: 0, startW: 0, endW: 0, tookMs: 0 };
  fire("mousedown", x0, y0, handle);
  await new Promise((r) => requestAnimationFrame(r));
  res.startW = Math.round(panel().getBoundingClientRect().width);
  const el = document.querySelector("#tradingview-right-dock .ta-glass");
  const mo = el
    ? new MutationObserver((list) => {
        res.mutations += list.length;
      })
    : null;
  mo?.observe(el, { characterData: true, childList: true, subtree: true });
  let stop = false;
  const countFrame = () => {
    res.frames++;
    if (!stop) requestAnimationFrame(countFrame);
  };
  requestAnimationFrame(countFrame);
  const t0 = performance.now();
  for (let i = 1; i <= res.moves; i++) {
    fire("mousemove", x0 - i * 4, y0, window);
    await new Promise((r) => setTimeout(r, 0));
  }
  res.tookMs = Math.round(performance.now() - t0);
  stop = true;
  await new Promise((r) => setTimeout(r, 250));
  fire("mouseup", x0, y0, window);
  await new Promise((r) => setTimeout(r, 120));
  mo?.disconnect();
  res.endW = Math.round(panel().getBoundingClientRect().width);
  return res;
});
console.log(JSON.stringify(coalesce, null, 1));
console.log(
  `  coalesce: ${coalesce.moves} moves in ${coalesce.tookMs}ms spanning ${coalesce.frames} frames ` +
    `=> ${coalesce.mutations} commits (per-event would be ${coalesce.moves}); ` +
    `${coalesce.startW}px -> ${coalesce.endW}px`,
);
await resetWidth();

console.log("\n=== summary ===");
for (const r of results) {
  const changes = r.canvasChanges;
  console.log(
    `  ${r.label.padEnd(18)} moves=${String(r.moves).padStart(3)}  canvasChanges=${String(changes.length).padStart(3)}  ` +
      `first@${changes.length ? changes[0].dtFromAnchor : "-"}ms  ` +
      `end canvas=${r.end.canvasW} widget=${r.end.widgetW} (delta ${r.end.widgetW - r.end.canvasW})  ` +
      `end dock/panel=${r.end.dockW}/${r.end.panelW}  ` +
      `forcedResizeMoved=${r.forcedResizeMovedPx}px  ` +
      (r.readoutMutations !== undefined ? `readoutUpdates=${r.readoutMutations}  ` : "") +
      `gaps med=${r.gaps.median} p95=${r.gaps.p95} max=${r.gaps.max}  longTasks=${r.longTasks.length}`,
  );
}
console.log(
  JSON.stringify(
    {
      url,
      viewport: "1920x945",
      panelWidths: {
        before: widthsBefore,
        afterPaced: widthsAfterPaced,
        afterBurst: widthsAfterBurst,
      },
    },
    null,
    1,
  ),
);

await browser.close();
