import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
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
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/ws": { target: "ws://127.0.0.1:8000", ws: true },
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
  },
});
