import { describe, expect, it } from "bun:test";
import { makeLimiter } from "./rate-limit";

describe("makeLimiter", () => {
  it("admits up to capacity then 429s", () => {
    const l = makeLimiter({ capacity: 3, windowMs: 60_000 });
    expect(l.take("k").ok).toBe(true);
    expect(l.take("k").ok).toBe(true);
    expect(l.take("k").ok).toBe(true);
    const blocked = l.take("k");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("isolates buckets per key", () => {
    const l = makeLimiter({ capacity: 1, windowMs: 60_000 });
    expect(l.take("alice").ok).toBe(true);
    expect(l.take("bob").ok).toBe(true);
    expect(l.take("alice").ok).toBe(false);
    expect(l.take("bob").ok).toBe(false);
  });

  it("refills proportionally over time", async () => {
    const l = makeLimiter({ capacity: 2, windowMs: 200 });
    expect(l.take("k").ok).toBe(true);
    expect(l.take("k").ok).toBe(true);
    expect(l.take("k").ok).toBe(false);
    await new Promise((r) => setTimeout(r, 250));
    expect(l.take("k").ok).toBe(true);
  });
});
