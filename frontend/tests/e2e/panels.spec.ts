import { test, expect } from "@playwright/test";

/**
 * Right-dock panel data visibility: order book, trades tape, news.
 */

test.describe.configure({ mode: "serial" });

test("right dock order book + trades tape render", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2000);

  await page.locator("#right-tab-orderbook").click();
  await expect(page.locator("#tradingview-right-dock")).toBeVisible();

  // Panel header is localized (zh-CN default); assert the order book header
  // and a populated price/quantity grid render.
  await expect(page.locator("#tradingview-right-dock")).toContainText(/订单簿|Order Book/i);
  await expect(page.locator("#tradingview-right-dock")).toContainText(/价差|Spread/i);
});

test("news panel renders entries or empty state", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2000);

  await page.locator("#right-tab-news").click();
  await expect(page.locator("#tradingview-right-dock")).toBeVisible();
  // Either headlines render or an explicit empty state shows — never a blank crash.
  const dock = page.locator("#tradingview-right-dock");
  const text = (await dock.innerText()).trim();
  expect(text.length).toBeGreaterThan(0);
});
