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

// Sudo gate for destructive routes (DELETE, dispute resolve, withdraw mark,
// user ban). Requires a fresh 2FA-backed token in `X-Sudo`. Reads are exempt.
router.use("*", async (c, next) => {
  const sudoPathRe = /\/(reports\/.*\/resolve|disputes\/.*\/resolve|withdrawals\/.*\/mark|users\/.*\/(ban|unban)|listings\/[^/]+|wallet\/credit)$/;
  const needsSudo =
    c.req.method !== "GET" && (c.req.method === "DELETE" || sudoPathRe.test(c.req.path));
  if (needsSudo) {
    const actor = c.get("user");
    if (!actor) return c.json({ error: { message: "Unauthorized" } }, 401);
    const token = c.req.header("x-sudo");
    if (!token) {
      return c.json({ error: { message: "Privileged action — POST /api/me/sudo with 2FA first" } }, 401);
    }
    const { verifySudoToken } = await import("../lib/sudo");
    if (!(await verifySudoToken(token, actor.id))) {
      return c.json({ error: { message: "Sudo session expired or invalid" } }, 401);
    }
  }
  await next();
});

// Audit log every mutating admin call. Reads are skipped to keep the table
// from filling up; mutations get a row including actor, path, and target id.
router.use("*", async (c, next) => {
  await next();
  if (c.req.method === "GET") return;
  const actor = c.get("user");
  const { audit } = await import("../lib/audit");
  audit({
    actorId: actor?.id ?? null,
    action: `admin.${c.req.method.toLowerCase()}.${c.req.path}`,
    ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: c.req.header("user-agent") ?? undefined,
    metadata: { status: c.res.status },
  }).catch(() => {});
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

// --- Settlement report (CSV) ---
// GET /api/admin/settlement.csv?from=YYYY-MM-DD&to=YYYY-MM-DD
// Completed trades within the range, grouped by listing.country, with totals
// for gross, fees, VAT and net-to-sellers.
router.get("/settlement.csv", async (c) => {
  const fromStr = c.req.query("from");
  const toStr = c.req.query("to");
  const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = toStr ? new Date(toStr) : new Date();

  const trades = await prisma.trade.findMany({
    where: { status: "completed", completedAt: { gte: from, lte: to } },
    include: { listing: { select: { country: true, category: true } } },
    take: 5000,
  });

  type Bucket = { country: string; currency: string; count: number; gross: number; fees: number; vat: number; net: number };
  const buckets = new Map<string, Bucket>();
  for (const t of trades) {
    const key = `${t.listing.country}|${t.currency}`;
    const b = buckets.get(key) ?? {
      country: t.listing.country,
      currency: t.currency,
      count: 0,
      gross: 0,
      fees: 0,
      vat: 0,
      net: 0,
    };
    b.count += 1;
    b.gross += t.amount;
    b.fees += t.feeAmount;
    b.vat += t.taxAmount;
    b.net += t.amount - t.feeAmount;
    buckets.set(key, b);
  }

  const lines = ["country,currency,trade_count,gross_minor,fees_minor,vat_minor,net_to_sellers_minor"];
  for (const b of buckets.values()) {
    lines.push([b.country, b.currency, b.count, b.gross, b.fees, b.vat, b.net].join(","));
  }
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header(
    "Content-Disposition",
    `attachment; filename="alcurry-settlement-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv"`,
  );
  return c.body(lines.join("\n"));
});

// --- Withdrawal queue ---

router.get("/withdrawals", async (c) => {
  const status = c.req.query("status") || "pending";
  const rows = await prisma.withdrawal.findMany({
    where: { status },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  return c.json({ data: rows });
});

const withdrawalMarkSchema = z.object({
  status: z.enum(["paid", "failed"]),
  providerRef: z.string().trim().max(120).optional(),
  failureReason: z.string().trim().max(500).optional(),
});

router.post("/withdrawals/:id/mark", zValidator("json", withdrawalMarkSchema), async (c) => {
  const me = c.get("user");
  if (!me) return c.json({ error: { message: "Unauthorized" } }, 401);
  const { id } = c.req.param();
  const { status, providerRef, failureReason } = c.req.valid("json");

  const w = await prisma.withdrawal.findUnique({ where: { id } });
  if (!w) return c.json({ error: { message: "Not found" } }, 404);
  if (w.status !== "pending") return c.json({ error: { message: `Already ${w.status}` } }, 400);

  if (status === "paid") {
    await prisma.withdrawal.update({
      where: { id },
      data: { status: "paid", paidAt: new Date(), providerRef: providerRef ?? null },
    });
    const { sendPushToUser } = await import("../lib/push");
    sendPushToUser(w.userId, {
      title: "Withdrawal paid",
      body: `${w.currency} ${(w.amount / 100).toFixed(2)} sent to your ${w.method === "mobile_money" ? "mobile money" : "bank"}.`,
      data: { type: "withdrawal", withdrawalId: w.id },
      kind: "chat",
    }).catch(() => {});
    return c.json({ data: { ok: true } });
  }

  // Failed: reverse the original debit so funds reappear in the wallet.
  const { getOrCreateWallet, postEntry } = await import("../lib/wallet");
  const wallet = await getOrCreateWallet(w.userId, w.currency);
  await prisma.$transaction(async (tx) => {
    await postEntry(tx, {
      walletId: wallet.id,
      kind: "deposit",
      amount: w.amount,
      currency: w.currency,
      refType: "external",
      refId: w.id,
      description: `Withdrawal reversed: ${failureReason ?? "no reason"}`,
    });
    await tx.withdrawal.update({
      where: { id },
      data: { status: "failed", failureReason: failureReason ?? "Marked failed by admin" },
    });
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
  const me = c.get("user");
  if (!me) return c.json({ error: { message: "Unauthorized" } }, 401);
  const { id } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    action?: "refund" | "release";
    note?: string;
  };
  if (body.action !== "refund" && body.action !== "release") {
    return c.json({ error: { message: "action must be refund or release" } }, 400);
  }
  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) return c.json({ error: { message: "Not found" } }, 404);
  if (trade.status !== "disputed") {
    return c.json({ error: { message: `Trade is ${trade.status}` } }, 400);
  }

  const { getOrCreateWallet, postEntry } = await import("../lib/wallet");
  const buyerWallet = await getOrCreateWallet(trade.buyerId, trade.currency);
  const sellerWallet = await getOrCreateWallet(trade.sellerId, trade.currency);

  if (body.action === "refund") {
    await prisma.$transaction(async (tx) => {
      await postEntry(tx, {
        walletId: buyerWallet.id,
        kind: "escrow_refund",
        amount: trade.amount,
        currency: trade.currency,
        refType: "trade",
        refId: trade.id,
        description: `Refunded by admin (${body.note ?? ""})`,
      });
      await tx.trade.update({
        where: { id: trade.id },
        data: { status: "refunded", refundedAt: new Date() },
      });
      await tx.tradeEvent.create({
        data: {
          tradeId: trade.id,
          kind: "refunded",
          actorId: me.id,
          note: body.note ?? "admin_refund",
        },
      });
    });
    return c.json({ data: { ok: true } });
  }

  // release: same wallet flow as buyer confirm, but admin is the actor.
  const fee = trade.feeAmount;
  const sellerCredit = trade.amount - fee;
  await prisma.$transaction(async (tx) => {
    await tx.walletTxn.create({
      data: {
        walletId: buyerWallet.id,
        kind: "transfer_out",
        amount: -trade.amount,
        currency: trade.currency,
        refType: "trade",
        refId: trade.id,
        description: "Escrow released by admin",
      },
    });
    await tx.wallet.update({
      where: { id: buyerWallet.id },
      data: { pendingDebit: { decrement: trade.amount } },
    });
    await postEntry(tx, {
      walletId: sellerWallet.id,
      kind: "escrow_release",
      amount: sellerCredit,
      currency: trade.currency,
      refType: "trade",
      refId: trade.id,
      description: "Escrow release (admin)",
    });
    if (fee > 0) {
      await tx.walletTxn.create({
        data: {
          walletId: sellerWallet.id,
          kind: "fee",
          amount: -fee,
          currency: trade.currency,
          refType: "trade",
          refId: trade.id,
          description: "Platform fee",
        },
      });
    }
    await tx.trade.update({
      where: { id: trade.id },
      data: { status: "completed", completedAt: new Date() },
    });
    await tx.tradeEvent.create({
      data: {
        tradeId: trade.id,
        kind: "completed",
        actorId: me.id,
        note: body.note ?? "admin_release",
      },
    });
    await tx.user.update({ where: { id: trade.buyerId }, data: { tradeCount: { increment: 1 } } });
    await tx.user.update({ where: { id: trade.sellerId }, data: { tradeCount: { increment: 1 } } });
    await tx.listing.update({ where: { id: trade.listingId }, data: { status: "sold" } }).catch(() => {});
  });
  return c.json({ data: { ok: true } });
});

export { router as adminRouter };
