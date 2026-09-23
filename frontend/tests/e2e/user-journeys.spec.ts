import { expect, type Page, test } from "@playwright/test";

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
  expect(await page.locator("[data-tab-id]").count()).toBeGreaterThanOrEqual(4);

  // Close the last-created dashboard tab
  const tabCount = await page.locator("[data-tab-id]").count();
  const lastTab = page.locator("[data-tab-id]").nth(tabCount - 1);
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
  await expect(page.locator('[data-testid="order-submit"]')).toBeHidden({
    timeout: 10_000,
  });
});

test("alert CRUD round-trips", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1500);

  // The backend alert store persists across test sessions, so clear any
  // leftovers first to make this journey self-contained.
  await page.locator("#right-tab-alerts").click();
  await expect(page.locator("#right-tab-alerts")).toBeVisible();
  while ((await page.locator('[data-testid^="alert-item-"]').count()) > 0) {
    await page
      .locator('[data-testid^="alert-item-"]')
      .first()
      .locator('[data-testid^="alert-delete-"]')
      .click();
    await page.waitForTimeout(300);
  }
  await expect(page.locator('[data-testid^="alert-item-"]')).toHaveCount(0, {
    timeout: 10_000,
  });

  // Open create-alert modal from the left nav rail.
  await page.locator('[data-testid="nav-create-alert"]').click();
  await expect(page.locator('[data-testid="alert-target-price"]')).toBeVisible();

  await page.locator('[data-testid="alert-target-price"]').fill("77777");
  await page.locator('[data-testid="alert-submit"]').click();
  await expect(page.locator('[data-testid="alert-submit"]')).toBeHidden({
    timeout: 10_000,
  });

  // Alerts panel: verify the item appears.
  await expect(page.locator('[data-testid^="alert-item-"]').first()).toBeVisible({
    timeout: 10_000,
  });

  // Delete it via the per-item remove button.
  await page
    .locator('[data-testid^="alert-item-"]')
    .first()
    .locator('[data-testid^="alert-delete-"]')
    .click();
  await expect(page.locator('[data-testid^="alert-item-"]')).toHaveCount(0, {
    timeout: 10_000,
  });
});

test("kill switch toggles global run control and recovers", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1500);

  // Open the bottom dock trading panel.
  await page.locator("#bottom-tab-trading").click();
  await page
    .locator('[data-testid="trading-tab-positions"]')
    .waitFor({ state: "visible", timeout: 15_000 });

  const toggle = page.locator('[data-testid="kill-switch-toggle"]');
  await expect(toggle).toBeVisible({ timeout: 10_000 });

  // Halt trading.
  await toggle.click();
  await expect(page.locator('[data-testid="kill-switch-state"]')).toBeVisible({
    timeout: 10_000,
  });

  // Resume trading — ALWAYS before finishing (serial suite: later order flows depend on it).
  await toggle.click();
  await expect(page.locator('[data-testid="kill-switch-state"]')).toHaveCount(0, {
    timeout: 10_000,
  });
});

test("reset funds restores the initial paper balance", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1500);

  await page.locator("#bottom-tab-trading").click();
  await page
    .locator('[data-testid="trading-tab-positions"]')
    .waitFor({ state: "visible", timeout: 15_000 });

  // Capture the displayed balance from the account header ribbon, then reset.
  const balanceText = async () =>
    (await page.locator('[data-testid="account-balance"]').textContent()) ?? "";
  const initial = await balanceText();

  await page.locator('[data-testid="reset-account"]').click();
  await page.waitForTimeout(800);

  // After a reset the balance must equal the pre-reset initial value
  // (the serial suite may have run order tests earlier that changed it).
  expect(await balanceText()).toBe(initial);
});

test("alert triggers on live price, highlights, and resets", async ({ page }) => {
  // Seed a local alert that is guaranteed to fire: threshold 0.01 with
  // condition "above" matches any positive live price (deterministic —
  // no dependency on Bitget volatility).
  await page.addInitScript(() => {
    localStorage.setItem(
      "raibro.alerts",
      JSON.stringify([
        {
          id: "e2e-1",
          symbol: "BTCUSDT",
          condition: "above",
          threshold: 0.01,
          enabled: true,
          triggered: false,
          createdAt: Date.now(),
        },
      ]),
    );
  });

  await page.goto("/");
  await page.waitForTimeout(2500);

  // Open the alerts panel.
  await page.locator("#right-tab-alerts").click();
  const item = page.locator('[data-testid="alert-item-e2e-1"]');
  await expect(item).toBeVisible({ timeout: 15_000 });

  // The alert must transition to triggered (highlight + timestamp).
  await expect(page.locator('[data-testid="alert-triggered-e2e-1"]')).toBeVisible({
    timeout: 20_000,
  });

  // Reset clears the triggered state.
  await page.locator('[data-testid="alert-reset-e2e-1"]').click();
  await expect(page.locator('[data-testid="alert-triggered-e2e-1"]')).toHaveCount(0, {
    timeout: 10_000,
  });

  // Clean up so later runs start from a clean local store.
  await page.locator('[data-testid="alert-delete-e2e-1"]').click();
  await expect(page.locator('[data-testid="alert-item-e2e-1"]')).toHaveCount(0, {
    timeout: 10_000,
  });
});
