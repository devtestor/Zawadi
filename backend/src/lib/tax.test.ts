import { describe, expect, it } from "bun:test";
import { computeTax, taxBpsForCountry } from "./tax";

describe("taxBpsForCountry", () => {
  it("returns the right basis-points for known countries", () => {
    expect(taxBpsForCountry("Kenya")).toBe(1600);
    expect(taxBpsForCountry("Nigeria")).toBe(750);
    expect(taxBpsForCountry("South Africa")).toBe(1500);
    expect(taxBpsForCountry("Rwanda")).toBe(1800);
    expect(taxBpsForCountry("Egypt")).toBe(1400);
  });

  it("falls back to 0 for unknown or empty", () => {
    expect(taxBpsForCountry("Atlantis")).toBe(0);
    expect(taxBpsForCountry("")).toBe(0);
    expect(taxBpsForCountry(undefined)).toBe(0);
    expect(taxBpsForCountry(null)).toBe(0);
  });
});

describe("computeTax", () => {
  it("computes VAT on the platform fee", () => {
    // 1000 fee × 1600 bps = 160 (Kenya 16%)
    expect(computeTax(1000, "Kenya")).toEqual({ amount: 160, bps: 1600 });
    // 5_000_00 fee × 1500 bps = 75000 (ZA 15%)
    expect(computeTax(500_00, "South Africa")).toEqual({ amount: 7500, bps: 1500 });
  });

  it("rounds down on fractional cents", () => {
    // 999 × 0.16 = 159.84 → floor to 159
    expect(computeTax(999, "Kenya")).toEqual({ amount: 159, bps: 1600 });
  });

  it("returns 0 amount when country is unknown", () => {
    expect(computeTax(1000, "Atlantis")).toEqual({ amount: 0, bps: 0 });
  });

  it("returns 0 when fee is 0", () => {
    expect(computeTax(0, "Kenya")).toEqual({ amount: 0, bps: 1600 });
  });
});
