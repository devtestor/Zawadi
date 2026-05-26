// Tiny in-memory token-bucket. Fine for single-instance deployments; swap for
// Redis if you scale horizontally.

interface Bucket {
  tokens: number;
  refilledAt: number;
}

interface Limiter {
  take: (key: string) => { ok: true } | { ok: false; retryAfterMs: number };
}

export function makeLimiter({ capacity, windowMs }: { capacity: number; windowMs: number }): Limiter {
  const buckets = new Map<string, Bucket>();
  return {
    take(key) {
      const now = Date.now();
      const cur = buckets.get(key);
      if (!cur) {
        buckets.set(key, { tokens: capacity - 1, refilledAt: now });
        return { ok: true };
      }
      // refill proportionally to elapsed time
      const elapsed = now - cur.refilledAt;
      const refilled = Math.min(capacity, cur.tokens + (elapsed / windowMs) * capacity);
      cur.tokens = refilled;
      cur.refilledAt = now;
      if (cur.tokens >= 1) {
        cur.tokens -= 1;
        return { ok: true };
      }
      const need = 1 - cur.tokens;
      const retryAfterMs = Math.ceil((need / capacity) * windowMs);
      return { ok: false, retryAfterMs };
    },
  };
}
