import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? 8000}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/ws": {
        target: `ws://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? 8000}`,
        ws: true,
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
