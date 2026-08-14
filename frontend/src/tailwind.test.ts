import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const configPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../tailwind.config.js",
);

describe("tailwind content scanning", () => {
  it("includes Vue SFC files so component utility classes are generated", () => {
    const raw = readFileSync(configPath, "utf-8");
    expect(raw).toMatch(/content:.*\.\{vue,ts,tsx\}/);
  });

  it("keeps html entry in the scan list", () => {
    const raw = readFileSync(configPath, "utf-8");
    expect(raw).toContain("index.html");
  });
});
