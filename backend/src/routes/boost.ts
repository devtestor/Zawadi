import { Hono } from "hono";
import crypto from "crypto";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { env } from "../env";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

const PAYSTACK_BASE = "https://api.paystack.co";

// Tiers are defined in USD for display. The actual charge is converted to the
// provider currency (env.PAYSTACK_CURRENCY) at a fixed rate below.
const BOOST_TIERS: Record<string, { days: number; amount: number; label: string }> = {
  basic: { days: 3, amount: 5, label: "3-day boost" },
  standard: { days: 7, amount: 10, label: "7-day boost" },
  premium: { days: 30, amount: 30, label: "30-day boost" },
};

// Rough fixed rates so we can test without a live FX feed. Override per-deployment
// by editing these numbers if needed.
const USD_TO: Record<string, number> = {
  USD: 1,
  NGN: 1500,
  GHS: 12,
  KES: 130,
  ZAR: 18,
};

function convertUSD(amountUsd: number, currency: string): number {
  const rate = USD_TO[currency] ?? 1;
  return Math.round(amountUsd * rate);
}

// POST /api/boost/:listingId - start a Paystack payment for a boost
router.post("/:listingId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { listingId } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as { tier?: string };
  const tierKey = body.tier || "standard";
  const tier = BOOST_TIERS[tierKey];
  if (!tier) return c.json({ error: { message: "Invalid tier" } }, 400);

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return c.json({ error: { message: "Listing not found" } }, 404);
  if (listing.userId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);

  if (!env.PAYSTACK_SECRET_KEY) {
    return c.json({ error: { message: "Payments not configured. Add PAYSTACK_SECRET_KEY." } }, 503);
  }

  const currency = env.PAYSTACK_CURRENCY.toUpperCase();
  const amount = convertUSD(tier.amount, currency);
  const txRef = `boost_${listingId}_${Date.now()}`;

  await prisma.boostPayment.create({
    data: {
      listingId,
      userId: user.id,
      provider: "paystack",
      txRef,
      amount,
      currency,
      days: tier.days,
      status: "pending",
    },
  });

  const callbackUrl = `${env.BACKEND_URL}/api/boost/return`;

  const payload = {
    email: user.email,
    amount: amount * 100, // Paystack expects subunits (kobo/pesewa/cents)
    currency,
    reference: txRef,
    callback_url: callbackUrl,
    metadata: {
      listingId,
      userId: user.id,
      tier: tierKey,
      custom_fields: [
        { display_name: "Listing", variable_name: "listing", value: listing.title },
        { display_name: "Plan", variable_name: "plan", value: tier.label },
      ],
    },
  };

  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; access_code?: string; reference?: string };
  };

  if (!res.ok || !data.status || !data.data?.authorization_url) {
    return c.json({ error: { message: data.message || "Failed to initiate payment" } }, 502);
  }

  return c.json({
    data: {
      checkoutUrl: data.data.authorization_url,
      txRef,
      tier: { ...tier, chargedAmount: amount, chargedCurrency: currency },
    },
  });
});

// GET /api/boost/return - Paystack redirects here after checkout
router.get("/return", async (c) => {
  const { reference, trxref } = c.req.query();
  const ref = reference || trxref;
  if (!ref) return c.text("Missing reference", 400);

  const payment = await prisma.boostPayment.findUnique({ where: { txRef: ref } });
  if (!payment) return c.text("Payment not found", 404);

  const verified = await verifyAndApply(payment.id);
  return c.html(renderReturn(verified ? "Boost activated!" : "Payment could not be verified", verified));
});

// POST /api/boost/webhook - Paystack server-to-server notification
router.post("/webhook", async (c) => {
  const raw = await c.req.text();
  const signature = c.req.header("x-paystack-signature");

  if (env.PAYSTACK_SECRET_KEY && signature) {
    const expected = crypto
      .createHmac("sha512", env.PAYSTACK_SECRET_KEY)
      .update(raw)
      .digest("hex");
    if (expected !== signature) {
      return c.json({ error: { message: "Invalid signature" } }, 401);
    }
  }

  let event: { event?: string; data?: { reference?: string; status?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return c.json({ error: { message: "Invalid JSON" } }, 400);
  }

  const ref = event.data?.reference;
  if (!ref) return c.json({ error: { message: "Missing reference" } }, 400);

  const payment = await prisma.boostPayment.findUnique({ where: { txRef: ref } });
  if (!payment) return c.json({ error: { message: "Payment not found" } }, 404);

  if (event.event === "charge.success") {
    await verifyAndApply(payment.id);
  }
  return c.json({ data: { ok: true } });
});

async function verifyAndApply(paymentId: string): Promise<boolean> {
  const payment = await prisma.boostPayment.findUnique({ where: { id: paymentId } });
  if (!payment) return false;
  if (payment.status === "successful") return true;

  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(payment.txRef)}`, {
    headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
  });
  const data = (await res.json()) as {
    status?: boolean;
    data?: { status?: string; reference?: string; amount?: number; currency?: string; id?: number };
  };

  const ok =
    data.status === true &&
    data.data?.status === "success" &&
    data.data?.reference === payment.txRef &&
    data.data?.amount === payment.amount * 100 &&
    data.data?.currency === payment.currency;

  if (!ok) {
    await prisma.boostPayment.update({
      where: { id: paymentId },
      data: {
        status: "failed",
        providerTxId: data.data?.id ? String(data.data.id) : null,
        verifiedAt: new Date(),
      },
    });
    return false;
  }

  const now = new Date();
  const listing = await prisma.listing.findUnique({ where: { id: payment.listingId } });
  const base = listing?.boostedUntil && listing.boostedUntil > now ? listing.boostedUntil : now;
  const boostedUntil = new Date(base.getTime() + payment.days * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.boostPayment.update({
      where: { id: paymentId },
      data: {
        status: "successful",
        providerTxId: data.data?.id ? String(data.data.id) : null,
        verifiedAt: now,
      },
    }),
    prisma.listing.update({
      where: { id: payment.listingId },
      data: { boosted: true, boostedUntil },
    }),
  ]);
  return true;
}

function renderReturn(message: string, ok: boolean): string {
  const color = ok ? "#1A6B4A" : "#C0392B";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZAWADI Boost</title></head><body style="margin:0;background:#0A0A0F;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;"><div style="text-align:center;padding:32px;max-width:420px"><div style="font-size:48px;margin-bottom:16px">${ok ? "✅" : "⚠️"}</div><h1 style="color:${color};font-size:22px;margin:0 0 8px">${message}</h1><p style="color:#888;font-size:14px;margin:0 0 24px">You can close this window and return to the app.</p><a href="zawadi://listings" style="background:#D4A843;color:#0A0A0F;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:800;display:inline-block">Back to app</a></div></body></html>`;
}

export { router as boostRouter, BOOST_TIERS };
