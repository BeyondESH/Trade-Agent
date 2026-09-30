import { describe, expect, it } from "vitest";
import { amplitudePercent, compactNumber, formatPercent, formatPrice } from "./format";

describe("compactNumber", () => {
  it("collapses magnitudes to 2-decimal suffixes", () => {
    expect(compactNumber("2554663417.12124")).toBe("2.55B");
    expect(compactNumber(14_670_000)).toBe("14.67M");
    expect(compactNumber(12_345)).toBe("12.35K");
    expect(compactNumber(412.5)).toBe("412.50");
    expect(compactNumber("1.2e13")).toBe("12.00T");
  });

  it("returns an em dash for missing or unparseable input", () => {
    expect(compactNumber(null)).toBe("\u2014");
    expect(compactNumber("-")).toBe("\u2014");
    expect(compactNumber("")).toBe("\u2014");
    expect(compactNumber("abc")).toBe("\u2014");
  });

  it("handles negative magnitudes", () => {
    expect(compactNumber(-2_500_000)).toBe("-2.50M");
  });
});

describe("formatPrice", () => {
  it("renders at the instrument precision", () => {
    expect(formatPrice(83917.712, 1)).toBe("83,917.7");
    expect(formatPrice(0.29412, 5)).toBe("0.29412");
  });

  it("returns an em dash when there is no quote yet", () => {
    expect(formatPrice(0)).toBe("\u2014");
    expect(formatPrice(null)).toBe("\u2014");
    expect(formatPrice(Number.NaN)).toBe("\u2014");
  });
});

describe("formatPercent", () => {
  it("always signs the value and keeps 2 decimals", () => {
    expect(formatPercent(1.236)).toBe("+1.24%");
    expect(formatPercent(-0.412)).toBe("-0.41%");
    expect(formatPercent(0)).toBe("+0.00%");
  });
});

describe("amplitudePercent", () => {
  it("measures the 24h range against the low", () => {
    expect(amplitudePercent(110, 100)).toBeCloseTo(10);
  });

  it("returns null for an unusable range", () => {
    expect(amplitudePercent(110, 0)).toBeNull();
    expect(amplitudePercent(Number.NaN, 100)).toBeNull();
  });
});
