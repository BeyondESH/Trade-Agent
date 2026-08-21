import { test, expect } from "@playwright/test";

/**
 * QUANT LAB end-to-end journey: open the agent view, run a backtest through
 * the real backend, verify the auto-switch to the signal-kline tab, then run
 * a parameter sweep and verify the heatmap renders.
 */

test.describe.configure({ mode: "serial" });

test("QUANT LAB renders tabs, runs a backtest with signal-kline auto-switch", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1500);

  // Enter the AI Agent view via the nav rail (title tooltip "AI Agent").
  await page.locator('#global-nav-rail button[title="AI Agent"]').click();
  await page.waitForTimeout(800);

  // QUANT LAB tabs visible (including the new signal-kline + diagnostics).
  await expect(page.getByRole("tab", { name: "信号K线" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "曲线分析" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "模型诊断" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "参数扫描" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Walk-forward" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "开单明细" })).toBeVisible();

  // Run a backtest; success auto-switches to the 信号K线 tab with a kline chart.
  await page.getByRole("button", { name: "Run Backtest" }).click();
  await expect(page.getByRole("tab", { name: "信号K线" })).toHaveAttribute("data-state", "active", {
    timeout: 60_000,
  });
  await expect(page.locator(".klinecharts-container, canvas").first()).toBeVisible({
    timeout: 30_000,
  });
});

test("QUANT LAB runs a parameter sweep", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1500);

  await page.locator('#global-nav-rail button[title="AI Agent"]').click();
  await page.waitForTimeout(800);

  // Switch to the parameter-sweep tab and run a scan.
  const sweepTab = page.getByRole("tab", { name: "参数扫描" });
  await sweepTab.click();
  await expect(page.getByText(/点击「运行参数扫描」/)).toBeVisible();
  await page.getByRole("button", { name: "运行参数扫描" }).click();

  // Wait for the heatmap grid cells to appear.
  await expect(page.getByText("参数扫描 (阈值 × 费用)")).toBeVisible();
  await expect(page.locator("button", { hasText: "%" }).first()).toBeVisible({
    timeout: 30_000,
  });
});
