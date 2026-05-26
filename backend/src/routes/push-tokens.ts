import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { pushTokenSchema } from "../lib/schemas";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

// POST /api/push-tokens - register an Expo push token for the current user
router.post("/", zValidator("json", pushTokenSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { token, platform } = c.req.valid("json");

  const saved = await prisma.pushToken.upsert({
    where: { token },
    create: { userId: user.id, token, platform },
    update: { userId: user.id, platform },
  });

  return c.json({ data: saved }, 201);
});

// DELETE /api/push-tokens/:token - unregister
router.delete("/:token", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { token } = c.req.param();
  await prisma.pushToken.deleteMany({ where: { token, userId: user.id } });
  return c.body(null, 204);
});

export { router as pushTokensRouter };
