import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { reportCreateSchema } from "../lib/schemas";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

// POST /api/reports - file a report (auth required)
router.post("/", zValidator("json", reportCreateSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { listingId, subjectId, reason, body } = c.req.valid("json");

  if (listingId) {
    const exists = await prisma.listing.findUnique({ where: { id: listingId }, select: { id: true, userId: true } });
    if (!exists) return c.json({ error: { message: "Listing not found" } }, 404);
    if (exists.userId === user.id) return c.json({ error: { message: "You cannot report your own listing" } }, 400);
  }
  if (subjectId && subjectId === user.id) {
    return c.json({ error: { message: "You cannot report yourself" } }, 400);
  }
  if (subjectId) {
    const exists = await prisma.user.findUnique({ where: { id: subjectId }, select: { id: true } });
    if (!exists) return c.json({ error: { message: "User not found" } }, 404);
  }

  const report = await prisma.report.create({
    data: {
      reporterId: user.id,
      listingId: listingId ?? null,
      subjectId: subjectId ?? null,
      reason,
      body,
    },
  });

  return c.json({ data: report }, 201);
});

export { router as reportsRouter };
