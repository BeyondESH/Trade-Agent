import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import budgets from "./perf-budgets.json";

const BACKEND = `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? 8000}`;
const BACKEND_WS = `ws://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? 8000}`;

/**
 * Dev and preview share one proxy table: `vite preview` does NOT inherit
 * `server.proxy`, so the production build would otherwise serve the UI with no
 * data at all. Declaring the routes once keeps the two deployments honest.
 */
const PROXY = {
  "/api": {
    target: BACKEND,
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api/, ""),
  },
  "/ws": { target: BACKEND_WS, ws: true },
};

/**
 * Initial-chunk size budget (frontend-performance-budgets tasks 3.6 / 6.1).
 *
 * `initialChunk` = the entry chunk Vite reports as `dist/assets/index-*.js`
 * (uncompressed, as Vite measures it; kB = 1000 bytes). It is the budget the
 * change's `frontend-code-splitting` spec calls the "初始 JS 体积上限".
 *
 * The single source of truth is `frontend/perf-budgets.json`, shared with
 * `scripts/perf-gate.mjs` and the CI perf job. The budget is enforced at build
 * time by `initialChunkBudgetPlugin` below, so `vite build` fails rather than
 * silently letting the entry chunk regrow.
 *
 * Measurement condition: production `vite build` (minified, no sourcemaps),
 * with the `manualChunks` split below and the six non-chart views + the chart
 * lazy in App.tsx.
 *   pre-change baseline : 998.73 kB  (single monolithic chunk)
 *   measured 2026-09-30 : 152.40 kB  (entry chunk)
 *
 * Ratchet direction for a size cap is DOWNWARD: the budget may only be
 * tightened, never relaxed without an evidence-backed change — the mirror of
 * the coverage ratchet in `test.coverage.thresholds`.
 */
export const INITIAL_CHUNK_BUDGET_KB = budgets.budgets.initialChunkKb;

/**
 * Fails the production build when the entry (`index-*.js`) chunk exceeds
 * `INITIAL_CHUNK_BUDGET_KB`. Uses only Rollup's built-in `generateBundle` hook,
 * so no visualizer/plugin dependency is added. A recorded exemption in
 * `perf-budgets.json` downgrades the failure to an explicit warning instead of
 * silently ignoring the breach (see the frontend-performance-budgets spec's
 * "预算失败的处置" requirement).
 */
function initialChunkBudgetPlugin(): Plugin {
  return {
    name: "initial-chunk-budget",
    apply: "build",
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find((c) => c.type === "chunk" && c.isEntry);
      if (entry?.type !== "chunk") return;
      const kb = Buffer.byteLength(entry.code, "utf8") / 1000;
      if (kb <= INITIAL_CHUNK_BUDGET_KB) return;
      const message = `初始块 ${entry.fileName} = ${kb.toFixed(2)} kB 超过预算 ${INITIAL_CHUNK_BUDGET_KB} kB`;
      const exemptions = budgets.exemptions as Record<
        string,
        { reason: string; convergence: string } | undefined
      >;
      const exemption = exemptions.initialChunkKb;
      if (exemption) {
        this.warn(
          `${message}；已登记豁免：${exemption.reason}（收敛计划：${exemption.convergence}）`,
        );
        return;
      }
      this.error(message);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), initialChunkBudgetPlugin()],
  resolve: {
    alias: {
      // Vendored klinecharts-pro (prebuilt ESM; package resolution via file: is flaky on Windows).
      "@klinecharts/pro": fileURLToPath(
        new URL("./vendor/klinecharts-pro/dist/klinecharts-pro.js", import.meta.url),
      ),
    },
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.E2E_FRONTEND_PORT ?? 5173),
    strictPort: Boolean(process.env.E2E_FRONTEND_PORT),
    proxy: PROXY,
  },
  preview: {
    host: "127.0.0.1",
    port: Number(process.env.E2E_PREVIEW_PORT ?? 4173),
    proxy: PROXY,
  },
  build: {
    // The heavy vendors get their own long-lived, cacheable chunks so the entry
    // chunk stays small and a vendored lib bump does not invalidate app code.
    // NOTE: everything mapped here is still reached by a static import from the
    // entry, so this is chunk *layout*, not deferred loading. The deferred half
    // of the split lives in App.tsx (the six non-chart views via React.lazy) and
    // in main.tsx (the font stylesheet). The chart vendor is intentionally NOT
    // deferred: the chart watermark is the measured LCP element.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Vendored klinecharts-pro lives outside node_modules (see the alias).
          if (id.includes("vendor/klinecharts-pro")) return "chart-pro";
          if (id.includes("node_modules/klinecharts")) return "chart-core";
          if (id.includes("node_modules/motion") || id.includes("node_modules/framer-motion"))
            return "motion";
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/") ||
            id.includes("node_modules/scheduler")
          )
            return "react-vendor";
          if (id.includes("node_modules")) return "vendor";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "node",
    globals: true,
    fileParallelism: false,
    setupFiles: ["./src/test-setup.ts"],
    exclude: [
      "tests/e2e/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/test-setup.ts",
        "src/vendor/**",
        "src/main.tsx",
      ],
      // Ratchet policy ("只升不降"): the measured baseline at introduction was
      // 55.69% lines / 55.69% statements over `src/**` (383 tests). The gate is
      // that baseline floored DOWN to a whole percent so it is never above the
      // measured value; it may only be raised, never lowered.
      thresholds: {
        lines: 55,
        statements: 55,
      },
    },
  },
});
