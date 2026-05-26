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
  await sendSms(phone, `ZAWADI verification code: ${code}. Valid for 10 minutes.`);
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
