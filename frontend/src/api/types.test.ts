import { describe, expect, it } from "vitest";
import { CATEGORY_LABELS, categoryLabel } from "./types";

describe("categoryLabel", () => {
  it("maps known instType terms to Chinese labels", () => {
    expect(categoryLabel("SPOT")).toBe("现货");
    expect(categoryLabel("USDT-FUTURES")).toBe("U本位合约");
    expect(categoryLabel("USDC-FUTURES")).toBe("USDC本位合约");
    expect(categoryLabel("COIN-FUTURES")).toBe("币本位合约");
    expect(categoryLabel("MARGIN")).toBe("现货杠杆");
  });

  it("covers simulated categories", () => {
    expect(categoryLabel("SUSDT-FUTURES")).toBe("U本位模拟合约");
    expect(categoryLabel("SUSDC-FUTURES")).toBe("USDC本位模拟合约");
    expect(categoryLabel("SCOIN-FUTURES")).toBe("币本位模拟合约");
  });

  it("falls back to the raw value for unknown categories", () => {
    expect(categoryLabel("SOMETHING-ELSE")).toBe("SOMETHING-ELSE");
    expect(categoryLabel("")).toBe("");
    expect(categoryLabel(undefined)).toBe("");
  });

  it("keeps every MARKET_CATEGORIES entry in the label map", () => {
    for (const cat of ["SPOT", "USDT-FUTURES"]) {
      expect(CATEGORY_LABELS[cat]).toBeTruthy();
    }
  });
});
