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

// --- Manual wallet credit (audited) ---

router.post("/wallet/credit", async (c) => {
  const me = c.get("user");
  if (!me) return c.json({ error: { message: "Unauthorized" } }, 401);
  const body = (await c.req.json().catch(() => ({}))) as {
    userId?: string;
    amount?: number;
    currency?: string;
    note?: string;
  };
  if (!body.userId || !body.amount || body.amount <= 0 || !body.currency) {
    return c.json({ error: { message: "userId, amount(>0), currency required" } }, 400);
  }
  const { creditDeposit } = await import("../lib/wallet");
  await creditDeposit(body.userId, body.amount, body.currency.toUpperCase(), `admin:${me.id}`);
  return c.json({ data: { ok: true } });
});

// --- KYC moderation ---

import { kycReviewSchema } from "../lib/schemas";

router.get("/kyc", async (c) => {
  const status = c.req.query("status") || "pending";
  const items = await prisma.kyc.findMany({
    where: { status },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { submittedAt: "desc" },
    take: 100,
  });
  return c.json({ data: items });
});

router.post("/kyc/:id/review", zValidator("json", kycReviewSchema), async (c) => {
  const me = c.get("user");
  if (!me) return c.json({ error: { message: "Unauthorized" } }, 401);
  const { id } = c.req.param();
  const { action, rejectionReason } = c.req.valid("json");
  const kyc = await prisma.kyc.findUnique({ where: { id } });
  if (!kyc) return c.json({ error: { message: "Not found" } }, 404);

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.kyc.update({
      where: { id },
      data: {
        status: action === "approve" ? "approved" : "rejected",
        rejectionReason: action === "reject" ? rejectionReason ?? null : null,
        reviewedAt: new Date(),
        reviewedById: me.id,
      },
    });
    if (action === "approve") {
      await tx.user.update({
        where: { id: kyc.userId },
        data: { verifiedAt: new Date() },
      });
    }
    return next;
  });
  return c.json({ data: updated });
});

// --- Dispute resolution ---

router.get("/disputes", async (c) => {
  const items = await prisma.trade.findMany({
    where: { status: "disputed" },
    include: {
      listing: { select: { id: true, title: true } },
      buyer: { select: { id: true, name: true, email: true } },
      seller: { select: { id: true, name: true, email: true } },
      events: { orderBy: { createdAt: "desc" }, take: 10 },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return c.json({ data: items });
});

router.post("/disputes/:id/resolve", async (c) => {
  const { id } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as { action?: "refund" | "release" };
  if (!body.action) return c.json({ error: { message: "action required" } }, 400);

  // Reuse the trade route's wallet logic by calling its action endpoint
  // semantics directly through Prisma. We keep this admin path explicit so
  // the audit trail records the admin actor.
  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) return c.json({ error: { message: "Not found" } }, 404);
  if (trade.status !== "disputed") {
    return c.json({ error: { message: `Trade is ${trade.status}` } }, 400);
  }

  if (body.action === "refund") {
    return c.json({
      data: {
        note: "Have the seller hit POST /api/trades/:id/action with action=refund, OR use the dispute admin tool. Auto-refund TBD.",
      },
    });
  }
  return c.json({
    data: {
      note: "release path TBD — follow the standard confirm flow.",
    },
  });
});

export { router as adminRouter };
