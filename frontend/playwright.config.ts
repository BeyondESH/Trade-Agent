import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BACKEND_PORT = 8000;
const FRONTEND_PORT = 5173;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const BACKEND_DIR = resolve(__dirname, "../backend");
const PYTHON = resolve(BACKEND_DIR, ".venv/Scripts/python.exe");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], headless: true },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      url: `http://127.0.0.1:${FRONTEND_PORT}`,
      reuseExistingServer: true,
      timeout: 60_000,
      cwd: ".",
    },
    {
      command: `"${PYTHON}" -m market_data.cli serve --port ${BACKEND_PORT}`,
      url: `${BACKEND_URL}/health`,
      reuseExistingServer: true,
      timeout: 60_000,
      cwd: BACKEND_DIR,
    },
  ],
});
