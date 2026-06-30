import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import {
  userUpdateSchema,
  phoneStartSchema,
  phoneVerifySchema,
  notificationPrefsSchema,
  businessApplySchema,
  referralRedeemSchema,
} from "../lib/schemas";
import { sendSms } from "../lib/sms";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

// 7-char base32-ish code (no ambiguous chars).
function generateReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 7; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

// GET /api/me - get current user profile
router.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  // Lazy-mint a referral code on first profile fetch.
  const existing = await prisma.user.findUnique({ where: { id: user.id }, select: { referralCode: true } });
  if (!existing?.referralCode) {
    let attempt = 0;
    while (attempt < 5) {
      const code = generateReferralCode();
      try {
        await prisma.user.update({ where: { id: user.id }, data: { referralCode: code } });
        break;
      } catch {
        attempt += 1;
      }
    }
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      phone: true,
      phoneVerified: true,
      verifiedAt: true,
      role: true,
      businessName: true,
      businessType: true,
      referralCode: true,
      notifyChat: true,
      notifyMarketing: true,
      notifySavedSearches: true,
      preferredLang: true,
      createdAt: true,
      _count: {
        select: { listings: true, favorites: true },
      },
    },
  });

  return c.json({ data: profile });
});

// PUT /api/me - update user profile
router.put("/", zValidator("json", userUpdateSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const data = c.req.valid("json");
  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      phone: true,
    },
  });

  return c.json({ data: updated });
});

// GET /api/me/my/listings - get current user's own listings
router.get("/my/listings", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const listings = await prisma.listing.findMany({
    where: { userId: user.id, deletedAt: null },
    include: {
      images: { orderBy: { order: "asc" }, take: 1 },
      _count: { select: { favorites: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ data: listings });
});

// GET /api/me/:id/stats - public trade reputation snapshot for a user.
router.get("/:id/stats", async (c) => {
  const { id } = c.req.param();
  const exists = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      role: true,
      businessName: true,
      businessType: true,
      verifiedAt: true,
      createdAt: true,
      ratingSum: true,
      ratingCount: true,
    },
  });
  if (!exists) return c.json({ error: { message: "Not found" } }, 404);

  const TERMINAL_GOOD = ["completed"];
  const TERMINAL_BAD = ["refunded", "cancelled", "disputed"];

  const [buyerAll, buyerOk, sellerAll, sellerOk, listed] = await Promise.all([
    prisma.trade.count({ where: { buyerId: id } }),
    prisma.trade.count({ where: { buyerId: id, status: { in: TERMINAL_GOOD } } }),
    prisma.trade.count({ where: { sellerId: id } }),
    prisma.trade.count({ where: { sellerId: id, status: { in: TERMINAL_GOOD } } }),
    prisma.listing.count({ where: { userId: id, deletedAt: null } }),
  ]);
  const buyerDisputed = await prisma.trade.count({
    where: { buyerId: id, status: { in: TERMINAL_BAD } },
  });
  const sellerDisputed = await prisma.trade.count({
    where: { sellerId: id, status: { in: TERMINAL_BAD } },
  });

  const pct = (ok: number, all: number) => (all > 0 ? Math.round((ok / all) * 100) : null);

  return c.json({
    data: {
      user: exists,
      // Realtor = business seller of type "agency"
      realtor: exists.role === "business" && exists.businessType === "agency",
      listings: listed,
      buyer: {
        total: buyerAll,
        completed: buyerOk,
        disputed: buyerDisputed,
        successRate: pct(buyerOk, buyerAll),
      },
      seller: {
        total: sellerAll,
        completed: sellerOk,
        disputed: sellerDisputed,
        successRate: pct(sellerOk, sellerAll),
      },
      reviews: {
        count: exists.ratingCount,
        average: exists.ratingCount > 0 ? Math.round((exists.ratingSum / exists.ratingCount) * 10) / 10 : null,
      },
    },
  });
});

// GET /api/me/:id/listings - get public listings by user
router.get("/:id/listings", async (c) => {
  const { id } = c.req.param();
  const listings = await prisma.listing.findMany({
    where: { userId: id, status: "active", deletedAt: null },
    include: {
      images: { orderBy: { order: "asc" }, take: 1 },
      _count: { select: { favorites: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ data: listings });
});

// POST /api/me/phone/start - send a 6-digit code to the supplied phone.
router.post("/phone/start", zValidator("json", phoneStartSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { phone } = c.req.valid("json");
  // Rate limit: 1 per 60s per user
  const last = await prisma.phoneVerification.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  if (last && Date.now() - last.createdAt.getTime() < 60_000) {
    return c.json({ error: { message: "Please wait a minute before requesting another code" } }, 429);
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.phoneVerification.create({
    data: {
      userId: user.id,
      phone,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  await sendSms(phone, `Alcurry verification code: ${code}. Valid for 10 minutes.`);
  return c.json({ data: { ok: true } });
});

// POST /api/me/phone/verify - submit the 6-digit code.
router.post("/phone/verify", zValidator("json", phoneVerifySchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { code } = c.req.valid("json");
  const pending = await prisma.phoneVerification.findFirst({
    where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) return c.json({ error: { message: "No active verification — request a new code" } }, 400);
  if (pending.attempts >= 5) {
    return c.json({ error: { message: "Too many attempts. Request a new code." } }, 429);
  }
  if (pending.code !== code) {
    await prisma.phoneVerification.update({
      where: { id: pending.id },
      data: { attempts: { increment: 1 } },
    });
    return c.json({ error: { message: "Invalid code" } }, 400);
  }
  await prisma.$transaction([
    prisma.phoneVerification.update({
      where: { id: pending.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { phone: pending.phone, phoneVerified: true },
    }),
  ]);
  return c.json({ data: { ok: true } });
});

// POST /api/me/business/apply - upgrade to business tier (phone+email-verified required).
router.post("/business/apply", zValidator("json", businessApplySchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { phoneVerified: true, emailVerified: true, role: true },
  });
  if (!me) return c.json({ error: { message: "Not found" } }, 404);
  if (!me.phoneVerified) {
    return c.json({ error: { message: "Verify your phone before upgrading to business." } }, 400);
  }
  if (me.role === "admin") {
    return c.json({ error: { message: "Admin role cannot apply for business tier" } }, 400);
  }

  const { businessName, businessType } = c.req.valid("json");
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: "business", businessName, businessType, verifiedAt: new Date() },
    select: { role: true, businessName: true, businessType: true, verifiedAt: true },
  });
  return c.json({ data: updated });
});

// POST /api/me/referral/redeem - apply a referral code at signup.
router.post("/referral/redeem", zValidator("json", referralRedeemSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { referredById: true, referralCode: true } });
  if (!me) return c.json({ error: { message: "Not found" } }, 404);
  if (me.referredById) return c.json({ error: { message: "You've already used a referral code." } }, 400);

  const { code } = c.req.valid("json");
  if (me.referralCode === code.toUpperCase()) {
    return c.json({ error: { message: "You cannot redeem your own code." } }, 400);
  }
  const referrer = await prisma.user.findUnique({ where: { referralCode: code.toUpperCase() }, select: { id: true } });
  if (!referrer) return c.json({ error: { message: "Unknown referral code" } }, 404);

  await prisma.user.update({ where: { id: user.id }, data: { referredById: referrer.id } });
  return c.json({ data: { ok: true } });
});

// POST /api/me/totp/enroll - returns secret + otpauth URI for the user to scan.
router.post("/totp/enroll", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const { generateSecret, otpAuthUri } = await import("../lib/totp");
  const secret = generateSecret();
  await prisma.totpSecret.upsert({
    where: { userId: user.id },
    create: { userId: user.id, secret },
    update: { secret, verifiedAt: null },
  });
  return c.json({
    data: {
      secret,
      otpauthUri: otpAuthUri(user.email, secret),
    },
  });
});

// POST /api/me/totp/verify - confirms a code so the secret becomes active.
router.post("/totp/verify", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { code?: string };
  const code = (body.code ?? "").trim();
  if (!/^\d{6}$/.test(code)) return c.json({ error: { message: "Code must be 6 digits" } }, 400);
  const row = await prisma.totpSecret.findUnique({ where: { userId: user.id } });
  if (!row) return c.json({ error: { message: "Enroll first" } }, 400);
  const { verifyTotp } = await import("../lib/totp");
  if (!(await verifyTotp(row.secret, code))) {
    return c.json({ error: { message: "Invalid code" } }, 400);
  }
  await prisma.totpSecret.update({
    where: { userId: user.id },
    data: { verifiedAt: new Date() },
  });
  return c.json({ data: { ok: true } });
});

// DELETE /api/me/totp - disable 2FA (requires a current code).
router.delete("/totp", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const code = c.req.header("x-2fa-code") ?? "";
  const row = await prisma.totpSecret.findUnique({ where: { userId: user.id } });
  if (!row || !row.verifiedAt) {
    await prisma.totpSecret.deleteMany({ where: { userId: user.id } });
    return c.body(null, 204);
  }
  const { verifyTotp } = await import("../lib/totp");
  if (!(await verifyTotp(row.secret, code))) {
    return c.json({ error: { message: "Provide a current 2FA code in X-2FA-Code header" } }, 401);
  }
  await prisma.totpSecret.delete({ where: { userId: user.id } });
  return c.body(null, 204);
});

// POST /api/me/sudo - exchange a current 2FA code for a 5-minute privileged
// session token (returned in the response and as `X-Sudo` header for sudo-
// gated routes). 2FA must be enrolled.
router.post("/sudo", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { code?: string };
  const code = (body.code ?? "").trim();
  if (!/^\d{6}$/.test(code)) return c.json({ error: { message: "Code must be 6 digits" } }, 400);
  const row = await prisma.totpSecret.findUnique({ where: { userId: user.id } });
  if (!row || !row.verifiedAt) return c.json({ error: { message: "Enable 2FA first" } }, 403);
  const { verifyTotp } = await import("../lib/totp");
  if (!(await verifyTotp(row.secret, code))) return c.json({ error: { message: "Invalid code" } }, 401);
  const { mintSudoToken } = await import("../lib/sudo");
  const token = await mintSudoToken(user.id);
  c.header("X-Sudo", token);
  return c.json({ data: { token, expiresIn: 5 * 60 } });
});

// PUT /api/me/notifications - update notification + language prefs
router.put("/notifications", zValidator("json", notificationPrefsSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: c.req.valid("json"),
    select: {
      notifyChat: true,
      notifyMarketing: true,
      notifySavedSearches: true,
      preferredLang: true,
    },
  });
  return c.json({ data: updated });
});

export { router as usersRouter };
