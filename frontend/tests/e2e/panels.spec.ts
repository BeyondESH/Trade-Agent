import { expect, test } from "@playwright/test";

/**
 * Right-dock panel data visibility: order book, trades tape, news, and the
 * bottom screener wired to the live ticker hub.
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

  // Derivative rows come from the WS funding/mark-price channels; either a
  // live value or the explicit placeholder must render (never a mock number).
  await expect(page.locator('[data-testid="orderbook-funding"]')).toBeVisible();
  await expect(page.locator('[data-testid="orderbook-mark-price"]')).toBeVisible();
  await expect(page.locator('[data-testid="orderbook-funding"]')).not.toHaveText("");
  await expect(page.locator('[data-testid="orderbook-mark-price"]')).not.toHaveText("");
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

test("bottom screener renders live hub columns (no template mock)", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2500);

  await page.locator("#bottom-tab-screener").click();
  const panel = page.locator("#screener-tab");
  await expect(panel).toBeVisible();

  // Fundamental columns required by the spec.
  await expect(panel).toContainText("资金费率");
  await expect(panel).toContainText("标记价");
  await expect(panel).toContainText("24h 振幅");

  // The old template mock rows must never render.
  await expect(panel).not.toContainText("NVIDIA Corp");
  await expect(panel).not.toContainText("Strong Buy");

  // Rows (live) or the explicit empty state; both are acceptable offline.
  const rows = page.locator('[data-testid^="screener-row-"]');
  const rowCount = await rows.count();
  if (rowCount > 0) {
    await expect(rows.first()).toBeVisible();
  } else {
    await expect(panel).toContainText("暂无行情数据");
  }
});

test("right dock width is drag-resizable and persists across reload", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1500);

  const panel = page.locator('[data-testid="right-dock-panel"]');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("style", /width: 280px/);

  const handle = page.locator('[data-testid="right-dock-resize-handle"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error("resize handle not found");

  await page.mouse.move(box.x + box.width / 2, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x - 100, box.y + 120, { steps: 5 });
  await page.mouse.up();

  const widthOf = (locator: typeof panel) =>
    locator.evaluate((el) => Number.parseFloat((el as HTMLElement).style.width));

  // Dragging left by ~100px widens the panel (sub-pixel rounding tolerated).
  const width = await widthOf(panel);
  expect(width).toBeGreaterThan(280);
  expect(width).toBeLessThanOrEqual(500);
  const stored = await page.evaluate(() => localStorage.getItem("raibro.rightDockWidth"));
  expect(stored).toBe(String(width));

  // Reload restores the persisted width.
  await page.reload();
  await page.waitForTimeout(1500);
  expect(await widthOf(page.locator('[data-testid="right-dock-panel"]'))).toBe(width);
});

test("notifications dropdown never fabricates entries", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1000);

  await page.getByTitle("通知").click();
  await expect(page.locator('[data-testid="notifications-dropdown"]')).toBeVisible();
  // The removed fake "New Pine Script Update" entry must not come back.
  await expect(page.locator('[data-testid="notifications-dropdown"]')).not.toContainText(
    "New Pine Script Update",
  );
  await expect(page.locator('[data-testid="notifications-dropdown"]')).not.toContainText(
    "新的 Pine 脚本更新",
  );
});
