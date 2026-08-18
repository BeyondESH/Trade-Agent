import { describe, expect, it } from "vitest";
import { t, zh } from "./i18n";

describe("i18n dictionary", () => {
  it("translates known keys to Chinese", () => {
    expect(t("Watchlist")).toBe("自选");
    expect(t("Alerts")).toBe("提醒");
    expect(t("Order Book (DOM)")).toBe("订单簿 (DOM)");
  });

  it("falls back to the raw key for unknown strings", () => {
    expect(t("NoSuchKey")).toBe("NoSuchKey");
  });

  it("covers the core shell labels", () => {
    const core = [
      "New Chart Tab",
      "Command Palette",
      "Markets",
      "Screener",
      "Heatmaps",
      "Community",
      "News",
      "Pine Studio",
      "Brokers",
      "Watchlist",
      "Alerts",
      "Data Window",
      "Economic Calendar",
      "Order Book (DOM)",
    ];
    for (const k of core) {
      expect(t(k)).not.toBe(k);
    }
  });

  it("dictionary is a flat string map", () => {
    for (const [k, v] of Object.entries(zh)) {
      expect(typeof k).toBe("string");
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
