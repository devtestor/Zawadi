import type { Context, MiddlewareHandler } from "hono";
import { prisma } from "../prisma";
import { logger } from "./logger";

// Stripe-style idempotency. Callers pass `Idempotency-Key: <opaque>` and we
// store the first response keyed by (key + userId + path). Retries within 24h
// get the cached response instead of re-running the handler.
//
// We treat the key as 1-1 with response — if a caller reuses a key with a
// different body, we reject (which is also Stripe's behavior).

const TTL_MS = 24 * 60 * 60 * 1000;

export function withIdempotency(): MiddlewareHandler {
  return async (c, next) => {
    const key = c.req.header("idempotency-key");
    if (!key || !["POST", "PUT", "PATCH"].includes(c.req.method)) {
      await next();
      return;
    }
    if (key.length < 8 || key.length > 200) {
      return c.json({ error: { message: "Idempotency-Key must be 8–200 chars" } }, 400);
    }

    const user = c.get("user") as { id: string } | null;
    const composite = `${key}:${user?.id ?? "anon"}:${c.req.path}`;

    // Reap expired rows occasionally — cheap enough.
    prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});

    const existing = await prisma.idempotencyKey.findUnique({ where: { key: composite } });
    if (existing) {
      c.status(existing.status as 200);
      return c.body(existing.response, undefined, { "content-type": "application/json", "x-replayed": "true" });
    }

    await next();

    // Persist the response if it was 2xx/4xx (don't cache transient 5xx).
    try {
      const status = c.res.status;
      if (status >= 200 && status < 500 && c.res.headers.get("content-type")?.includes("application/json")) {
        // Hono mutates the response; clone before reading to leave the original intact.
        const cloned = c.res.clone();
        const body = await cloned.text();
        await prisma.idempotencyKey.create({
          data: {
            key: composite,
            userId: user?.id ?? null,
            method: c.req.method,
            path: c.req.path,
            status,
            response: body,
            expiresAt: new Date(Date.now() + TTL_MS),
          },
        });
      }
    } catch (e) {
      logger.warn("idempotency persist failed", { err: e instanceof Error ? e.message : String(e) });
    }
  };
}
