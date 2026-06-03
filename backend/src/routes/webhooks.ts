import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

const EVENTS = [
  "trade.created",
  "trade.delivered",
  "trade.completed",
  "trade.refunded",
  "trade.disputed",
  "listing.created",
  "listing.updated",
  "wallet.deposit",
  "wallet.withdraw",
  "*",
] as const;

const createSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(EVENTS)).min(1),
  // Optional — server generates a strong secret when not provided.
  secret: z.string().min(16).max(128).optional(),
});

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// GET /api/webhooks - subscriptions owned by current user (secret elided)
router.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const hooks = await prisma.webhook.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return c.json({
    data: hooks.map((h) => ({
      id: h.id,
      url: h.url,
      events: h.events.split(",").map((s) => s.trim()).filter(Boolean),
      active: h.active,
      createdAt: h.createdAt,
      // Show only a prefix so subscribers can recognise the secret without exposing it.
      secretHint: `${h.secret.slice(0, 4)}…${h.secret.slice(-4)}`,
    })),
  });
});

// POST /api/webhooks - create a subscription. The secret is returned ONCE.
router.post("/", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const body = c.req.valid("json");
  const hook = await prisma.webhook.create({
    data: {
      ownerId: user.id,
      url: body.url,
      events: body.events.join(","),
      secret: body.secret ?? randomSecret(),
    },
  });
  return c.json({ data: hook }, 201);
});

router.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const { id } = c.req.param();
  const hook = await prisma.webhook.findUnique({ where: { id } });
  if (!hook) return c.json({ error: { message: "Not found" } }, 404);
  if (hook.ownerId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);
  await prisma.webhook.delete({ where: { id } });
  return c.body(null, 204);
});

// POST /api/webhooks/:id/rotate - mint a new primary secret; previous is
// kept as `secretPrev` so deliveries during the overlap window carry both.
router.post("/:id/rotate", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const { id } = c.req.param();
  const hook = await prisma.webhook.findUnique({ where: { id } });
  if (!hook) return c.json({ error: { message: "Not found" } }, 404);
  if (hook.ownerId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);

  const next = randomSecret();
  await prisma.webhook.update({
    where: { id },
    data: { secret: next, secretPrev: hook.secret, secretRotatedAt: new Date() },
  });
  return c.json({ data: { id, secret: next, message: "Old secret stays valid until you finalize." } });
});

// POST /api/webhooks/:id/rotate/finalize - drop the previous secret.
router.post("/:id/rotate/finalize", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const { id } = c.req.param();
  const hook = await prisma.webhook.findUnique({ where: { id } });
  if (!hook) return c.json({ error: { message: "Not found" } }, 404);
  if (hook.ownerId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);
  await prisma.webhook.update({ where: { id }, data: { secretPrev: null } });
  return c.json({ data: { ok: true } });
});

// POST /api/webhooks/:id/test - send a synthetic "test.ping" delivery.
router.post("/:id/test", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const { id } = c.req.param();
  const hook = await prisma.webhook.findUnique({ where: { id } });
  if (!hook) return c.json({ error: { message: "Not found" } }, 404);
  if (hook.ownerId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);

  await prisma.webhookDelivery.create({
    data: {
      webhookId: hook.id,
      event: "test.ping",
      payload: JSON.stringify({ event: "test.ping", data: { sentAt: new Date().toISOString() } }),
      status: "pending",
      nextAttemptAt: new Date(),
    },
  });
  return c.json({ data: { ok: true } });
});

// GET /api/webhooks/:id/deliveries - last 50 attempts (for debugging)
router.get("/:id/deliveries", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const { id } = c.req.param();
  const hook = await prisma.webhook.findUnique({ where: { id } });
  if (!hook) return c.json({ error: { message: "Not found" } }, 404);
  if (hook.ownerId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);
  const deliveries = await prisma.webhookDelivery.findMany({
    where: { webhookId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return c.json({ data: deliveries });
});

export { router as webhooksRouter };
