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

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.string().trim()).max(20).optional(),
});

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// GET /api/me/api-keys
router.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return c.json({
    data: keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes ? k.scopes.split(",").map((s) => s.trim()).filter(Boolean) : [],
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    })),
  });
});

// POST /api/me/api-keys - returns the full key ONCE.
router.post("/", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const { name, scopes } = c.req.valid("json");

  const token = randomToken(); // 64 hex chars
  const prefix = `zaw_${token.slice(0, 8)}`;
  const fullKey = `${prefix}_${token.slice(8)}`;
  const hash = await sha256Hex(fullKey);

  const row = await prisma.apiKey.create({
    data: {
      userId: user.id,
      name,
      prefix,
      hash,
      scopes: scopes?.join(",") ?? "",
    },
  });

  return c.json({
    data: {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      // Returned exactly once — caller must store this.
      key: fullKey,
      scopes: scopes ?? [],
    },
  }, 201);
});

router.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const { id } = c.req.param();
  const row = await prisma.apiKey.findUnique({ where: { id } });
  if (!row) return c.json({ error: { message: "Not found" } }, 404);
  if (row.userId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  return c.body(null, 204);
});

export { router as apiKeysRouter };
