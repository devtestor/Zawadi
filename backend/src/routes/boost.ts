import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { env } from "../env";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

const FLW_BASE = "https://api.flutterwave.com/v3";

const BOOST_TIERS: Record<string, { days: number; amount: number; currency: string; label: string }> = {
  basic: { days: 3, amount: 5, currency: "USD", label: "3-day boost" },
  standard: { days: 7, amount: 10, currency: "USD", label: "7-day boost" },
  premium: { days: 30, amount: 30, currency: "USD", label: "30-day boost" },
};

// POST /api/boost/:listingId - start a Flutterwave payment for a boost
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

  if (!env.FLUTTERWAVE_SECRET_KEY) {
    return c.json({ error: { message: "Payments not configured. Add FLUTTERWAVE_SECRET_KEY." } }, 503);
  }

  const txRef = `boost_${listingId}_${Date.now()}`;

  await prisma.boostPayment.create({
    data: {
      listingId,
      userId: user.id,
      txRef,
      amount: tier.amount,
      currency: tier.currency,
      days: tier.days,
      status: "pending",
    },
  });

  const redirectUrl = `${env.BACKEND_URL}/api/boost/return`;

  const payload = {
    tx_ref: txRef,
    amount: tier.amount,
    currency: tier.currency,
    redirect_url: redirectUrl,
    payment_options: "card,mobilemoneyrwanda,mobilemoneyghana,mobilemoneyuganda,mobilemoneyzambia,mpesa,banktransfer,ussd",
    customer: {
      email: user.email,
      name: user.name,
    },
    customizations: {
      title: "ZAWADI Boost Listing",
      description: `${tier.label} — ${listing.title}`,
    },
    meta: { listingId, userId: user.id, tier: tierKey },
  };

  const res = await fetch(`${FLW_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as { status?: string; message?: string; data?: { link?: string } };
  if (!res.ok || data.status !== "success" || !data.data?.link) {
    return c.json({ error: { message: data.message || "Failed to initiate payment" } }, 502);
  }

  return c.json({ data: { checkoutUrl: data.data.link, txRef, tier } });
});

// GET /api/boost/return - Flutterwave redirects here after checkout
router.get("/return", async (c) => {
  const { tx_ref, transaction_id, status } = c.req.query();
  if (!tx_ref) return c.text("Missing tx_ref", 400);

  const payment = await prisma.boostPayment.findUnique({ where: { txRef: tx_ref } });
  if (!payment) return c.text("Payment not found", 404);

  if (status === "cancelled") {
    await prisma.boostPayment.update({ where: { txRef: tx_ref }, data: { status: "failed" } });
    return c.html(renderReturn("Payment cancelled", false));
  }

  if (!transaction_id) {
    return c.html(renderReturn("No transaction id returned", false));
  }

  const verified = await verifyAndApply(payment.id, transaction_id);
  return c.html(renderReturn(verified ? "Boost activated!" : "Payment could not be verified", verified));
});

// POST /api/boost/webhook - Flutterwave server-to-server notification
router.post("/webhook", async (c) => {
  const signature = c.req.header("verif-hash");
  if (env.FLUTTERWAVE_WEBHOOK_SECRET && signature !== env.FLUTTERWAVE_WEBHOOK_SECRET) {
    return c.json({ error: { message: "Invalid signature" } }, 401);
  }

  const body = (await c.req.json()) as { data?: { tx_ref?: string; id?: number | string; status?: string } };
  const txRef = body.data?.tx_ref;
  const txId = body.data?.id;
  if (!txRef || !txId) return c.json({ error: { message: "Missing tx_ref or id" } }, 400);

  const payment = await prisma.boostPayment.findUnique({ where: { txRef } });
  if (!payment) return c.json({ error: { message: "Payment not found" } }, 404);

  await verifyAndApply(payment.id, String(txId));
  return c.json({ data: { ok: true } });
});

async function verifyAndApply(paymentId: string, transactionId: string): Promise<boolean> {
  const payment = await prisma.boostPayment.findUnique({ where: { id: paymentId } });
  if (!payment) return false;
  if (payment.status === "successful") return true;

  const res = await fetch(`${FLW_BASE}/transactions/${transactionId}/verify`, {
    headers: { Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}` },
  });
  const data = (await res.json()) as {
    status?: string;
    data?: { status?: string; tx_ref?: string; amount?: number; currency?: string };
  };

  const ok =
    data.status === "success" &&
    data.data?.status === "successful" &&
    data.data?.tx_ref === payment.txRef &&
    data.data?.amount === payment.amount &&
    data.data?.currency === payment.currency;

  if (!ok) {
    await prisma.boostPayment.update({
      where: { id: paymentId },
      data: { status: "failed", flutterwaveId: transactionId, verifiedAt: new Date() },
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
      data: { status: "successful", flutterwaveId: transactionId, verifiedAt: now },
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
