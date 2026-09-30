// Functional check for the right dock after the width→transform + rAF change.
//
// Verifies, against the running production preview:
//   1. every one of the 8 tabs opens the drawer and leaves the chart correctly
//      sized (proved by forcing a klinecharts re-measure: a correct canvas does
//      not move);
//   2. close collapses the reserved space (dock == 44px) and the chart follows;
//   3. open reserves the space again and the chart follows;
//   4. dragging to BOTH clamps lands on 500 / 260 px, persists the value and
//      keeps the chart exact (no stale canvas);
//   5. a reload restores the persisted width;
//   6. prefers-reduced-motion still toggles instantly and correctly.
//
// Usage: cd frontend && node scripts/perf-dock-functional-check.mjs
// Env:   PERF_URL  default http://127.0.0.1:4173
import { chromium } from "playwright";

const url = process.env.PERF_URL ?? "http://127.0.0.1:4173";
const TAB_IDS = [
  "watchlist",
  "alerts",
  "news",
  "datawindow",
  "hotlists",
  "calendar",
  "orderbook",
  "ideas",
];

const browser = await chromium.launch();

async function openDock(context) {
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__kline_chart__, null, { timeout: 30000 });
  await page.waitForTimeout(2200);
  return page;
}

/** Geometry + chart-exactness probe (forcing a re-measure must not move it). */
async function probe(page) {
  return page.evaluate(async () => {
    const panel = document.querySelector('[data-testid="right-dock-panel"]');
    const slider = panel.parentElement;
    const wrapper = slider.parentElement;
    const canvas = document.querySelector("canvas");
    const before = canvas.width;
    window.__kline_chart__?.resize();
    await new Promise((r) => setTimeout(r, 130));
    const c = document.querySelector("canvas");
    let widget = c;
    for (let i = 0; i < 6 && widget; i++) {
      if (String(widget.className).includes("klinecharts-pro-widget")) break;
      widget = widget.parentElement;
    }
    return {
      panel: Math.round(panel.getBoundingClientRect().width),
      wrapper: Math.round(wrapper.getBoundingClientRect().width),
      dock: Math.round(
        document.getElementById("tradingview-right-dock").getBoundingClientRect().width,
      ),
      canvas: c.width,
      widget: widget ? widget.clientWidth : -1,
      forcedMovePx: Math.abs(c.width - before),
      stored: localStorage.getItem("raibro.rightDockWidth"),
    };
  });
}

const lines = [];
const row = (label, d, extra = "") =>
  lines.push(
    `${label.padEnd(26)} panel=${String(d.panel).padStart(3)} wrapper=${String(d.wrapper).padStart(3)} dock=${String(d.dock).padStart(3)} ` +
      `canvas=${String(d.canvas).padStart(4)} widget=${String(d.widget).padStart(4)} forcedMove=${String(d.forcedMovePx).padStart(2)}px ` +
      `stored=${d.stored ?? "-"} ${extra}`,
  );

// ---- 1. all 8 tabs ---------------------------------------------------------
{
  const context = await browser.newContext({ viewport: { width: 1920, height: 945 } });
  const page = await openDock(context);
  for (const id of TAB_IDS) {
    const tab = page.locator(`#right-tab-${id}`);
    await tab.click();
    await page.waitForTimeout(700);
    // Clicking the already-active tab collapses; click again to re-open it.
    const isActive = await page.evaluate(
      (t) => !!document.querySelector(`#right-tab-${t} .text-signal-ink`),
      id,
    );
    if (!isActive) {
      await tab.click();
      await page.waitForTimeout(700);
    }
    const d = await probe(page);
    const open = d.dock > 44;
    row(`tab ${id}`, d, open ? "OPEN ✓" : "CLOSED ✗");
  }

  // ---- 2. close ------------------------------------------------------------
  await page.locator("#right-dock-collapse-toggle").click();
  await page.waitForTimeout(1100);
  row("close", await probe(page));

  // ---- 3. open -------------------------------------------------------------
  await page.locator("#right-dock-collapse-toggle").click();
  await page.waitForTimeout(1100);
  row("open", await probe(page));

  // ---- 4. drag to both clamps ---------------------------------------------
  const drag = async (dx) => {
    const h = await page.locator('[data-testid="right-dock-resize-handle"]').boundingBox();
    const hx = h.x + h.width / 2;
    const hy = h.y + h.height / 2;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx + dx, hy, { steps: 40 });
    await page.mouse.up();
    await page.waitForTimeout(450);
  };
  await drag(-600); // left => wider => 500 clamp
  row("drag to max (500)", await probe(page));
  await drag(600); // right => narrower => 260 clamp
  row("drag to min (260)", await probe(page));

  // ---- 5. reload restores the persisted width ------------------------------
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__kline_chart__, null, { timeout: 30000 });
  await page.waitForTimeout(2200);
  row("after reload", await probe(page));

  await context.close();
}

// ---- 6. reduced motion -----------------------------------------------------
{
  const context = await browser.newContext({
    viewport: { width: 1920, height: 945 },
    reducedMotion: "reduce",
  });
  const page = await openDock(context);
  row("reduce: initial", await probe(page));
  await page.locator("#right-dock-collapse-toggle").click();
  await page.waitForTimeout(120); // effectively instant
  row("reduce: close @120ms", await probe(page));
  await page.locator("#right-dock-collapse-toggle").click();
  await page.waitForTimeout(120);
  row("reduce: open @120ms", await probe(page));
  await context.close();
}

console.log(lines.join("\n"));
await browser.close();
