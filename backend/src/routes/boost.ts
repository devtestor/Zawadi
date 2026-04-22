import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { env } from "../env";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

const BOOST_TIERS: Record<string, { days: number; amount: number; label: string }> = {
  basic: { days: 3, amount: 5, label: "3-day boost" },
  standard: { days: 7, amount: 10, label: "7-day boost" },
  premium: { days: 30, amount: 30, label: "30-day boost" },
};

// USD → local rough conversion for display/charge. Pesapal supports RWF, KES,
// UGX, TZS and USD natively. Update these numbers per deployment if needed.
const USD_TO: Record<string, number> = {
  USD: 1,
  RWF: 1300,
  KES: 130,
  UGX: 3800,
  TZS: 2500,
};

function convertUSD(amountUsd: number, currency: string): number {
  const rate = USD_TO[currency] ?? 1;
  return Math.round(amountUsd * rate);
}

// ----- Pesapal helpers -----

let cachedToken: { value: string; expiresAt: number } | null = null;
let cachedIpnId: string | null = null;

async function pesapalAuth(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 10_000) {
    return cachedToken.value;
  }
  const res = await fetch(`${env.PESAPAL_BASE_URL}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      consumer_key: env.PESAPAL_CONSUMER_KEY,
      consumer_secret: env.PESAPAL_CONSUMER_SECRET,
    }),
  });
  const data = (await res.json()) as { token?: string; expiryDate?: string; error?: unknown };
  if (!res.ok || !data.token) {
    throw new Error("Pesapal auth failed");
  }
  // Tokens are valid ~5 minutes.
  cachedToken = { value: data.token, expiresAt: now + 4 * 60 * 1000 };
  return data.token;
}

async function pesapalIpnId(): Promise<string> {
  if (env.PESAPAL_IPN_ID) return env.PESAPAL_IPN_ID;
  if (cachedIpnId) return cachedIpnId;

  const token = await pesapalAuth();
  const ipnUrl = `${env.BACKEND_URL}/api/boost/ipn`;
  const res = await fetch(`${env.PESAPAL_BASE_URL}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url: ipnUrl, ipn_notification_type: "GET" }),
  });
  const data = (await res.json()) as { ipn_id?: string; error?: unknown };
  if (!res.ok || !data.ipn_id) {
    throw new Error("Pesapal IPN registration failed");
  }
  cachedIpnId = data.ipn_id;
  return data.ipn_id;
}

// ----- Routes -----

// POST /api/boost/:listingId - start a Pesapal payment for a boost
router.post("/:listingId", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { listingId } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as { tier?: string; phone?: string };
  const tierKey = body.tier || "standard";
  const tier = BOOST_TIERS[tierKey];
  if (!tier) return c.json({ error: { message: "Invalid tier" } }, 400);

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return c.json({ error: { message: "Listing not found" } }, 404);
  if (listing.userId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);

  if (!env.PESAPAL_CONSUMER_KEY || !env.PESAPAL_CONSUMER_SECRET) {
    return c.json(
      { error: { message: "Payments not configured. Add PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET." } },
      503,
    );
  }

  const currency = env.PESAPAL_CURRENCY.toUpperCase();
  const amount = convertUSD(tier.amount, currency);
  const txRef = `boost_${listingId}_${Date.now()}`;

  await prisma.boostPayment.create({
    data: {
      listingId,
      userId: user.id,
      provider: "pesapal",
      txRef,
      amount,
      currency,
      days: tier.days,
      status: "pending",
    },
  });

  let token: string;
  let notificationId: string;
  try {
    token = await pesapalAuth();
    notificationId = await pesapalIpnId();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Pesapal setup failed";
    return c.json({ error: { message } }, 502);
  }

  const displayName = user.name || user.email.split("@")[0] || "Customer";
  const parts = displayName.split(" ");
  const firstName = parts[0] || "Customer";
  const lastName = parts.slice(1).join(" ") || firstName;

  const payload: Record<string, unknown> = {
    id: txRef,
    currency,
    amount,
    description: `ZAWADI ${tier.label} – ${listing.title}`.slice(0, 100),
    callback_url: `${env.BACKEND_URL}/api/boost/return`,
    notification_id: notificationId,
    billing_address: {
      email_address: user.email,
      first_name: firstName,
      last_name: lastName,
      phone_number: body.phone || "",
    },
  };

  const res = await fetch(`${env.PESAPAL_BASE_URL}/api/Transactions/SubmitOrderRequest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as {
    order_tracking_id?: string;
    merchant_reference?: string;
    redirect_url?: string;
    error?: { code?: string; message?: string } | string;
    status?: string;
  };

  if (!res.ok || !data.redirect_url || !data.order_tracking_id) {
    const message =
      (typeof data.error === "object" && data.error?.message) ||
      (typeof data.error === "string" ? data.error : null) ||
      "Failed to initiate payment";
    return c.json({ error: { message } }, 502);
  }

  await prisma.boostPayment.update({
    where: { txRef },
    data: { providerTxId: data.order_tracking_id },
  });

  return c.json({
    data: {
      checkoutUrl: data.redirect_url,
      txRef,
      orderTrackingId: data.order_tracking_id,
      tier: { ...tier, chargedAmount: amount, chargedCurrency: currency },
    },
  });
});

// GET /api/boost/return - Pesapal redirects user here after checkout
router.get("/return", async (c) => {
  const orderTrackingId = c.req.query("OrderTrackingId");
  const merchantRef = c.req.query("OrderMerchantReference");
  const ref = merchantRef;
  if (!ref) return c.text("Missing reference", 400);

  const payment = await prisma.boostPayment.findUnique({ where: { txRef: ref } });
  if (!payment) return c.text("Payment not found", 404);

  const verified = await verifyAndApply(payment.id, orderTrackingId);
  return c.html(renderReturn(verified ? "Boost activated!" : "Payment pending or not completed", verified));
});

// GET /api/boost/ipn - Pesapal server-to-server notification (IPN)
// Pesapal sends GET params and expects a JSON ack back.
router.get("/ipn", async (c) => {
  const orderTrackingId = c.req.query("OrderTrackingId");
  const merchantRef = c.req.query("OrderMerchantReference");
  const notificationType = c.req.query("OrderNotificationType") || "IPNCHANGE";

  if (!merchantRef) return c.json({ error: { message: "Missing reference" } }, 400);

  const payment = await prisma.boostPayment.findUnique({ where: { txRef: merchantRef } });
  if (payment) {
    await verifyAndApply(payment.id, orderTrackingId);
  }

  return c.json({
    orderNotificationType: notificationType,
    orderTrackingId: orderTrackingId ?? "",
    orderMerchantReference: merchantRef,
    status: 200,
  });
});

async function verifyAndApply(paymentId: string, orderTrackingId?: string | null): Promise<boolean> {
  const payment = await prisma.boostPayment.findUnique({ where: { id: paymentId } });
  if (!payment) return false;
  if (payment.status === "successful") return true;

  const trackingId = orderTrackingId || payment.providerTxId;
  if (!trackingId) return false;

  const token = await pesapalAuth().catch(() => null);
  if (!token) return false;

  const res = await fetch(
    `${env.PESAPAL_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(trackingId)}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
  const data = (await res.json()) as {
    payment_method?: string;
    amount?: number;
    currency?: string;
    merchant_reference?: string;
    status_code?: number; // 0=INVALID 1=COMPLETED 2=FAILED 3=REVERSED
    payment_status_description?: string;
    confirmation_code?: string;
  };

  const completed = data.status_code === 1 || data.payment_status_description?.toUpperCase() === "COMPLETED";
  const failed = data.status_code === 2 || data.status_code === 3;

  const matches =
    completed &&
    data.merchant_reference === payment.txRef &&
    Math.round(Number(data.amount ?? 0)) === payment.amount &&
    (data.currency ?? "").toUpperCase() === payment.currency.toUpperCase();

  if (!matches) {
    if (failed) {
      await prisma.boostPayment.update({
        where: { id: paymentId },
        data: {
          status: "failed",
          providerTxId: trackingId,
          verifiedAt: new Date(),
        },
      });
    }
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
        providerTxId: data.confirmation_code || trackingId,
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
