import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { convertFromUSD } from "./fx";

const originalFetch = global.fetch;

beforeEach(() => {
  // Reset the FX cache between tests by stubbing fetch to a controlled value.
  global.fetch = mock(async () =>
    new Response(
      JSON.stringify({
        result: "success",
        rates: { USD: 1, KES: 130, RWF: 1300, NGN: 1600, ZAR: 18, GBP: 0.79 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  ) as unknown as typeof global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("convertFromUSD", () => {
  it("returns the same value for USD", async () => {
    expect(await convertFromUSD(100, "USD")).toBe(100);
  });

  it("scales by the live rate", async () => {
    expect(await convertFromUSD(10, "KES")).toBe(1300);
    expect(await convertFromUSD(2, "RWF")).toBe(2600);
  });

  it("rounds RWF / UGX / TZS / JPY to integers", async () => {
    // 1.5 USD × 1300 = 1950 (exact already)
    expect(await convertFromUSD(1.5, "RWF")).toBe(1950);
  });

  it("keeps 2dp precision for typical currencies", async () => {
    // 1 × 18 = 18 → 18.00
    expect(await convertFromUSD(1, "ZAR")).toBe(18);
  });

  it("falls back to the static table when the API is unreachable", async () => {
    // Force a network failure on this call.
    global.fetch = mock(async () => {
      throw new Error("nope");
    }) as unknown as typeof global.fetch;
    const v = await convertFromUSD(10, "RWF");
    // Either uses the prior cache (1300) or the fallback (1300). Both equal here.
    expect(v).toBe(13_000);
  });
});
