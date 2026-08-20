// Diagnose real-time k-line ordering end-to-end with Playwright.
//
// Opens the real frontend against a running backend, captures every /ws
// candle frame, reconciles each frame's last_candle against the live chart
// data column (REPLACE / APPEND / STALE), and validates the column stays a
// strictly ascending, duplicate-free time series. Writes a frame log + a
// chart screenshot to a results directory.
//
// Prereqs: uvicorn on :8000 and `npm run dev` (vite) both running.
// Usage:
//   node scripts/diagnose-kline-realtime.mjs \
//     [--timeframes 1m,5m,1h] [--window 30] [--port 5173] [--out ./e2e-results]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PORT = Number(arg("port", "5173"));
// Comma-separated timeframes to check in sequence, e.g. "1m,5m,1h".
const TIMEFRAMES = (arg("timeframes", arg("timeframe", "1h")) || "1h")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const WINDOW_SECONDS = Number(arg("window", "30"));
const OUT_DIR = arg("out", join(ROOT, "e2e-results"));

const BASE = `http://127.0.0.1:${PORT}`;
const DEFAULT_SYMBOL = "BTCUSDT";
const SERIES_CATEGORY = "USDT-FUTURES";

function check(ok, msg) {
  if (!ok) {
    console.error(`[FATAL] ${msg}`);
    process.exit(1);
  }
}

async function preflight(timeframe) {
  const backendOk = await fetch(
    `${BASE}/api/candles/recent?symbol=${DEFAULT_SYMBOL}&timeframe=${timeframe}&category=${SERIES_CATEGORY}`,
  )
    .then((r) => (r.ok ? r : Promise.reject(r)))
    .then((r) => r.json())
    .catch(() => null);
  check(
    backendOk && Array.isArray(backendOk.candles),
    `Backend/vite not serving /candles/recent at ${BASE}. Start uvicorn on :8000 and \`npm run dev\` first.`,
  );
  return backendOk;
}

async function runTimeframe(page, frames, snapshots, timeframe) {
  const startedAt = Date.now();

  // If the displayed period differs from the target, click the matching
  // period-bar button so we monitor the requested timeframe.
  await page.waitForFunction(
    () => {
      const c = window.__kline_chart__;
      if (!c) return false;
      const dl = c.getDataList ? c.getDataList() : [];
      return dl.length > 0;
    },
    null,
    { timeout: 30_000 },
  );

  // Determine the currently selected period from the period-bar DOM, and if it
  // differs from the target, click the matching period item. The pro chart's
  // period state is not exposed on the klinecharts Chart instance, so we rely
  // on the selected span (class "item period selected").
  const selected = await page
    .evaluate(() => {
      const el = document.querySelector(
        ".klinecharts-pro-period-bar span.item.period.selected",
      );
      return el ? el.textContent.trim() : null;
    })
    .catch(() => null);
  if (selected && selected !== timeframe) {
    const clicked = await page
      .locator(".klinecharts-pro-period-bar span.item.period")
      .filter({ hasText: new RegExp(`^${timeframe}$`) })
      .first()
      .click({ timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (!clicked) {
      console.warn(`[warn] could not switch period to ${timeframe} — continuing with displayed period.`);
    }
    await page.waitForTimeout(1500);
  }

  const sample = () =>
    page.evaluate(() => {
      const c = window.__kline_chart__;
      if (!c || !c.getDataList) return null;
      return c.getDataList().map((b) => b.timestamp);
    });

  const observe = async () => {
    const ts = await sample();
    if (!ts) return;
    snapshots.push({
      t: Date.now(),
      timeframe,
      tailTimestamp: ts[ts.length - 1] ?? null,
      length: ts.length,
      timestamps: ts,
    });
  };

  await observe();
  while (Date.now() - startedAt < WINDOW_SECONDS * 1000) {
    await page.waitForTimeout(1000);
    await observe();
  }
  await observe();
}

async function main() {
  await preflight(TIMEFRAMES[0]);
  mkdirSync(OUT_DIR, { recursive: true });

  const frames = []; // {t, category, symbol, timeframe, action, open_time, close}
  const snapshots = []; // {t, timeframe, tailTimestamp, length, timestamps}

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on("websocket", (ws) => {
    ws.on("framereceived", (f) => {
      let obj;
      try {
        obj = JSON.parse(f.payload);
      } catch {
        return;
      }
      if (obj && obj.channel === "candle" && obj.data && obj.data.last_candle) {
        frames.push({
          t: Date.now(),
          category: obj.category,
          symbol: obj.symbol,
          timeframe: obj.timeframe,
          action: obj.action,
          open_time: obj.data.last_candle.open_time,
          close: obj.data.last_candle.close,
        });
      }
    });
  });

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => !!window.__kline_chart__, null, { timeout: 30_000 });

  for (const tf of TIMEFRAMES) {
    await runTimeframe(page, frames, snapshots, tf);
  }

  // Final data column + monotonic / duplicate check for the last timeframe.
  const finalTs = snapshots.length ? (snapshots[snapshots.length - 1].timestamps ?? []) : [];
  let ascending = true;
  let duplicates = 0;
  for (let i = 1; i < finalTs.length; i++) {
    if (finalTs[i] < finalTs[i - 1]) ascending = false;
    if (finalTs[i] === finalTs[i - 1]) duplicates++;
  }

  // Reconciliation: classify each frame by the nearest snapshot at/before its
  // arrival time (snapshot cadence ~1s), so REPLACE/APPEND/STALE reflect the
  // chart state at roughly the moment the frame arrived.
  const tailAt = (frameT) => {
    let ref = null;
    for (const s of snapshots) {
      if (s.t <= frameT) ref = s;
      else break;
    }
    return ref && ref.tailTimestamp != null ? ref.tailTimestamp : null;
  };

  const bySeries = new Map();
  for (const f of frames) {
    const key = `${f.symbol}/${f.timeframe}`;
    if (!bySeries.has(key)) bySeries.set(key, { replace: 0, append: 0, stale: 0 });
  }
  let lastStale = null;
  for (const f of frames) {
    const key = `${f.symbol}/${f.timeframe}`;
    const entry = bySeries.get(key);
    const tail = tailAt(f.t);
    if (tail == null) continue;
    if (f.open_time === tail) entry.replace++;
    else if (f.open_time > tail) entry.append++;
    else {
      entry.stale++;
      lastStale = f;
    }
  }

  const screenshotPath = join(OUT_DIR, `chart-${TIMEFRAMES.at(-1)}.png`);
  await page.screenshot({ path: screenshotPath });

  const logPath = join(OUT_DIR, "frames.json");
  writeFileSync(
    logPath,
    JSON.stringify(
      {
        port: PORT,
        timeframes: TIMEFRAMES,
        windowSeconds: WINDOW_SECONDS,
        defaultSymbol: DEFAULT_SYMBOL,
        frames,
        snapshots,
        bySeries: Object.fromEntries(bySeries),
      },
      null,
      2,
    ),
  );

  // Verdict per timeframe: distinguish "no realtime data" from "stale/out-of-order".
  console.log("\n=== Diagnose k-line realtime order ===");
  console.log(`category/symbol : ${SERIES_CATEGORY}/${DEFAULT_SYMBOL}`);
  console.log(`window          : ${WINDOW_SECONDS}s per timeframe`);
  console.log(`frames captured : ${frames.length}`);
  console.log(`final column len: ${finalTs.length}`);
  console.log(`strictly asc    : ${ascending} (dups=${duplicates})`);
  console.log("classification per series:");
  for (const [k, v] of bySeries) console.log(`  ${k}: ${JSON.stringify(v)}`);

  let ok = true;
  for (const tf of TIMEFRAMES) {
    const matched = frames.filter((f) => f.timeframe === tf);
    if (matched.length === 0) {
      console.log(`  [${tf}] verdict: NO_REALTIME_DATA — no realtime frames observed`);
      ok = false;
    } else if (bySeries.get(`${DEFAULT_SYMBOL}/${tf}`)?.stale) {
      console.log(`  [${tf}] verdict: STALE_OUT_OF_ORDER — at least one frame lagged the chart tail`);
      ok = false;
    }
  }
  if (!ascending) {
    console.log(`  [all] verdict: SERIES_NOT_ASCENDING — duplicate or out-of-order timestamps (dups=${duplicates})`);
    ok = false;
  }
  if (ok) console.log("  [all] verdict: OK_ORDERED — realtime frames in order, series strictly ascending");
  console.log(`evidence : ${logPath}`);
  console.log(`screenshot: ${screenshotPath}\n`);

  await browser.close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
