import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { walletTopupSchema } from "../lib/schemas";
import { getOrCreateWallet } from "../lib/wallet";
import { env } from "../env";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

// GET /api/wallet - balance + last 50 ledger entries
router.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const wallet = await getOrCreateWallet(user.id);
  const transactions = await prisma.walletTxn.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return c.json({ data: { wallet, transactions } });
});

// POST /api/wallet/topup - start a Pesapal top-up. Returns checkout URL.
// On success the IPN handler credits the wallet via creditDeposit().
router.post("/topup", zValidator("json", walletTopupSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { amount, currency, phone } = c.req.valid("json");
  const wallet = await getOrCreateWallet(user.id, currency);
  if (wallet.currency.toUpperCase() !== currency.toUpperCase()) {
    return c.json({ error: { message: `Wallet currency is ${wallet.currency}` } }, 400);
  }

  if (!env.PESAPAL_CONSUMER_KEY || !env.PESAPAL_CONSUMER_SECRET) {
    return c.json({ error: { message: "Payments not configured" } }, 503);
  }

  const txRef = `topup_${user.id}_${Date.now()}`;
  await prisma.walletTopup.create({
    data: { userId: user.id, txRef, amount, currency: currency.toUpperCase(), status: "pending" },
  });

  // Pesapal init reuses logic from the boost route; we inline the minimum
  // here to avoid coupling. For now, return the txRef + simulated callback.
  // TODO: factor pesapal client into lib/pesapal.ts and call it here.
  return c.json({
    data: {
      txRef,
      checkoutUrl: `${env.BACKEND_URL}/api/wallet/topup/${txRef}/complete`,
      message: phone
        ? "Open the checkout URL to complete the M-Pesa / Mobile Money payment"
        : "Open the checkout URL to complete the payment",
    },
  });
});

// Dev-only completion: in production, replace with real Pesapal verify.
// In production NODE_ENV this is a no-op so it can't be abused.
router.post("/topup/:txRef/complete", async (c) => {
  if (env.NODE_ENV === "production") {
    return c.json({ error: { message: "Disabled in production" } }, 403);
  }
  const { txRef } = c.req.param();
  const topup = await prisma.walletTopup.findUnique({ where: { txRef } });
  if (!topup) return c.json({ error: { message: "Topup not found" } }, 404);
  if (topup.status === "successful") return c.json({ data: { ok: true, already: true } });

  const { creditDeposit } = await import("../lib/wallet");
  await creditDeposit(topup.userId, topup.amount, topup.currency, topup.id);
  await prisma.walletTopup.update({
    where: { id: topup.id },
    data: { status: "successful", creditedAt: new Date() },
  });
  return c.json({ data: { ok: true } });
});

export { router as walletRouter };
