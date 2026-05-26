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

// Gate everything in this router behind admin role.
router.use("*", async (c, next) => {
  const sessionUser = c.get("user");
  if (!sessionUser) return c.json({ error: { message: "Unauthorized" } }, 401);
  const u = await prisma.user.findUnique({ where: { id: sessionUser.id }, select: { role: true, bannedAt: true } });
  if (!u || u.role !== "admin" || u.bannedAt) {
    return c.json({ error: { message: "Forbidden" } }, 403);
  }
  await next();
});

const resolveSchema = z.object({
  action: z.enum(["dismiss", "remove_listing", "ban_user"]),
  note: z.string().trim().max(500).optional(),
});

// GET /api/admin/reports?status=open&limit=50
router.get("/reports", async (c) => {
  const status = c.req.query("status") || "open";
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "50") || 50, 1), 200);
  const reports = await prisma.report.findMany({
    where: { status },
    include: {
      reporter: { select: { id: true, name: true, email: true } },
      subject: { select: { id: true, name: true, email: true } },
      listing: { select: { id: true, title: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return c.json({ data: reports });
});

// POST /api/admin/reports/:id/resolve  { action, note? }
router.post("/reports/:id/resolve", zValidator("json", resolveSchema), async (c) => {
  const { id } = c.req.param();
  const { action } = c.req.valid("json");

  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return c.json({ error: { message: "Not found" } }, 404);

  await prisma.$transaction(async (tx) => {
    if (action === "remove_listing" && report.listingId) {
      await tx.listing.delete({ where: { id: report.listingId } });
    }
    if (action === "ban_user" && report.subjectId) {
      await tx.user.update({ where: { id: report.subjectId }, data: { bannedAt: new Date() } });
    }
    await tx.report.update({
      where: { id },
      data: {
        status: action === "dismiss" ? "dismissed" : "actioned",
        resolvedAt: new Date(),
      },
    });
  });

  return c.json({ data: { ok: true } });
});

// POST /api/admin/users/:id/ban
router.post("/users/:id/ban", async (c) => {
  const { id } = c.req.param();
  await prisma.user.update({ where: { id }, data: { bannedAt: new Date() } });
  return c.json({ data: { ok: true } });
});

// POST /api/admin/users/:id/unban
router.post("/users/:id/unban", async (c) => {
  const { id } = c.req.param();
  await prisma.user.update({ where: { id }, data: { bannedAt: null } });
  return c.json({ data: { ok: true } });
});

// DELETE /api/admin/listings/:id
router.delete("/listings/:id", async (c) => {
  const { id } = c.req.param();
  await prisma.listing.delete({ where: { id } });
  return c.json({ data: { ok: true } });
});

// GET /api/admin/queue - listings waiting for approval (high-value or duplicate-flagged).
router.get("/queue", async (c) => {
  const items = await prisma.listing.findMany({
    where: { underReview: true, deletedAt: null },
    include: {
      images: { take: 1, orderBy: { order: "asc" } },
      user: { select: { id: true, name: true, email: true, role: true } },
      duplicates: {
        include: { original: { select: { id: true, title: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  return c.json({ data: items });
});

// POST /api/admin/queue/:id/approve
router.post("/queue/:id/approve", async (c) => {
  const { id } = c.req.param();
  await prisma.listing.update({
    where: { id },
    data: { underReview: false, status: "active", approvedAt: new Date() },
  });
  return c.json({ data: { ok: true } });
});

// POST /api/admin/queue/:id/reject
router.post("/queue/:id/reject", async (c) => {
  const { id } = c.req.param();
  await prisma.listing.update({
    where: { id },
    data: { underReview: false, status: "pending", deletedAt: new Date() },
  });
  return c.json({ data: { ok: true } });
});

export { router as adminRouter };
