import { describe, expect, it } from "bun:test";
import { feeAmount } from "./wallet";

describe("feeAmount", () => {
  it("computes a platform fee at the configured basis points", () => {
    // Default PLATFORM_FEE_BPS = 250 (2.5%). 100_000 minor units → 2500.
    const fee = feeAmount(100_000);
    expect(fee).toBeGreaterThanOrEqual(0);
    expect(fee).toBeLessThanOrEqual(100_000);
    // Round-down semantics: 999 * 0.025 = 24.975 → 24
    expect(feeAmount(999)).toBeLessThan(feeAmount(1000));
  });

  it("returns 0 when amount is 0", () => {
    expect(feeAmount(0)).toBe(0);
  });
});
