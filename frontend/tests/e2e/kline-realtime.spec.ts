import { expect, type Page, test } from "@playwright/test";

/**
 * Chart render + symbol/timeframe switching + realtime ordering diagnostics.
 *
 * Reuses the read-only `window.__kline_chart__` handle exposed by
 * KLineChartProView (existing production code) to read the live data column.
 */

declare global {
  interface Window {
    __kline_chart__?: {
      getDataList(): Array<{
        timestamp: number;
        close: number;
        open: number;
        high: number;
        low: number;
        volume: number;
      }>;
    };
  }
}

test.describe.configure({ mode: "serial" });

async function waitForChartData(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const c = window.__kline_chart__;
      if (!c) return false;
      return Array.isArray(c.getDataList()) && c.getDataList().length > 0;
    },
    null,
    { timeout: 30_000 },
  );
}

async function chartDataList(page: Page): Promise<Array<{ timestamp: number }>> {
  return page.evaluate(
    () =>
      (window.__kline_chart__?.getDataList() ?? []) as Array<{
        timestamp: number;
      }>,
  );
}

test("chart renders real candles on first load", async ({ page }) => {
  await page.goto("/");
  await waitForChartData(page);
  const data = await chartDataList(page);
  expect(data.length).toBeGreaterThan(10);
  const timestamps = data.map((d) => d.timestamp);
  for (let i = 1; i < timestamps.length; i++) {
    expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
  }
});

test("timeframe switch changes bar period", async ({ page }) => {
  await page.goto("/");
  await waitForChartData(page);

  // The period bar is part of the vendored klinecharts-pro toolbar; click the
  // 15m item by visible label. Fall back to the 1h->15m period text.
  const periodItem = page.locator(".item.period").filter({ hasText: /15m/ }).first();
  await periodItem.click({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await waitForChartData(page);

  const data = await chartDataList(page);
  expect(data.length).toBeGreaterThan(5);
  const step = data[data.length - 1].timestamp - data[data.length - 2].timestamp;
  // 15m step == 900_000 ms
  expect(step).toBe(900_000);
});

test("realtime candle frames stay ordered (no stale append)", async ({ page }) => {
  // Attach the WS listener BEFORE navigation: Playwright only reports
  // websockets created after the listener is registered, and the app opens its
  // /ws connection during page load.
  const frames: Array<{ open_time: number }> = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", (e) => {
      try {
        const text = e.payload as string;
        if (!text) return;
        const obj = JSON.parse(text);
        const bc = obj?.data?.last_candle;
        if (obj?.channel === "candle" && bc) {
          frames.push({ open_time: Number(bc.open_time) });
        }
      } catch {
        /* ignore */
      }
    });
  });

  await page.goto("/");
  await waitForChartData(page);

  // Candle pushes are trade-driven: the live feed's cadence fluctuates with
  // market activity (observed ~0.2–0.8 frames/s for BTCUSDT). Poll until a
  // couple of frames have arrived instead of sampling a fixed 6s window,
  // which made this check flaky on quiet markets.
  await expect.poll(() => frames.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);

  for (let i = 1; i < frames.length; i++) {
    expect(frames[i].open_time).toBeGreaterThanOrEqual(frames[i - 1].open_time);
  }
});
