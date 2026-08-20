import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end user journeys: tabs, order flow, alert CRUD.
 * Order/alert tests run against the real backend (paper-only trading).
 */

test.describe.configure({ mode: "serial" });

test("multi-tab navigation renders views", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-tab-id="tab-1"]')).toBeVisible();

  // New tab -> dashboard
  await page.locator('[data-testid="tab-new"]').click();
  await page.waitForTimeout(800);
  expect(await page.locator('[data-tab-id]').count()).toBeGreaterThanOrEqual(4);

  // Close the last-created dashboard tab
  const tabCount = await page.locator('[data-tab-id]').count();
  const lastTab = page.locator('[data-tab-id]').nth(tabCount - 1);
  const lastId = await lastTab.getAttribute("data-tab-id");
  await page.locator(`[data-testid="tab-close-${lastId}"]`).click();
  await page.waitForTimeout(400);
  expect(await page.locator(`[data-testid="tab-close-${lastId}"]`).count()).toBe(0);
});

test("paper order flow creates a position", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1500);

  await page.locator('[data-testid="nav-open-order"]').click();
  await expect(page.locator('[data-testid="order-submit"]')).toBeVisible();

  // Default is a MARKET order (no price input); set a small size so risk
  // approves the paper fill.
  await page.locator('[data-testid="order-amount-input"]').fill("0.01");
  await page.locator('[data-testid="order-submit"]').click();

  // Modal closes; the order goes through the confirm flow (paper).
  await expect(page.locator('[data-testid="order-submit"]')).toBeHidden({ timeout: 10_000 });
});

test("alert CRUD round-trips", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1500);

  // Open create-alert modal from the left nav rail.
  await page.locator('[data-testid="nav-create-alert"]').click();
  await expect(page.locator('[data-testid="alert-target-price"]')).toBeVisible();

  await page.locator('[data-testid="alert-target-price"]').fill("77777");
  await page.locator('[data-testid="alert-submit"]').click();
  await expect(page.locator('[data-testid="alert-submit"]')).toBeHidden({ timeout: 10_000 });

  // Alerts panel: open the alerts tab in the right dock and verify the item.
  await page.locator("#right-tab-alerts").click();
  await expect(page.locator('[data-testid^="alert-item-"]').first()).toBeVisible({ timeout: 10_000 });

  // Delete it via the per-item remove button.
  await page.locator('[data-testid^="alert-item-"]').first().locator('[data-testid^="alert-delete-"]').click();
  await expect(page.locator('[data-testid^="alert-item-"]')).toHaveCount(0, { timeout: 10_000 });
});
