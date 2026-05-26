import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { savedSearchSchema } from "../lib/schemas";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

router.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const data = await prisma.savedSearch.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ data });
});

router.post("/", zValidator("json", savedSearchSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const body = c.req.valid("json");
  const data = await prisma.savedSearch.create({ data: { ...body, userId: user.id } });
  return c.json({ data }, 201);
});

router.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const { id } = c.req.param();
  const ss = await prisma.savedSearch.findUnique({ where: { id } });
  if (!ss) return c.json({ error: { message: "Not found" } }, 404);
  if (ss.userId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);
  await prisma.savedSearch.delete({ where: { id } });
  return c.body(null, 204);
});

export { router as savedSearchesRouter };
