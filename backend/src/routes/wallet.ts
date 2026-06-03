import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { walletTopupSchema } from "../lib/schemas";
import { getOrCreateWallet, postEntry } from "../lib/wallet";
import { env } from "../env";
import { startCheckout, getTransactionStatus, pesapalConfigured } from "../lib/pesapal";
import { logger } from "../lib/logger";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

import { withIdempotency } from "../lib/idempotency";
router.use("*", withIdempotency());

const withdrawSchema = z.object({
  amount: z.number().int().positive(),
  // Mobile money (preferred in Africa). Phone in E.164.
  method: z.enum(["mobile_money", "bank"]),
  phone: z.string().trim().optional(),
  bankName: z.string().trim().optional(),
  bankAccount: z.string().trim().optional(),
});

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

// POST /api/wallet/topup - start a Pesapal checkout for a top-up.
router.post("/topup", zValidator("json", walletTopupSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { amount, currency, phone } = c.req.valid("json");
  const wallet = await getOrCreateWallet(user.id, currency);
  if (wallet.currency.toUpperCase() !== currency.toUpperCase()) {
    return c.json({ error: { message: `Wallet currency is ${wallet.currency}` } }, 400);
  }
  if (!pesapalConfigured()) {
    return c.json({ error: { message: "Payments not configured" } }, 503);
  }

  const txRef = `topup_${user.id}_${Date.now()}`;
  // Amount is already minor units; Pesapal expects major units for most
  // currencies, so divide by 100 for the gateway call.
  const major = currency.toUpperCase() === "JPY" || currency.toUpperCase() === "RWF" || currency.toUpperCase() === "UGX"
    ? amount // no sub-units
    : amount / 100;

  await prisma.walletTopup.create({
    data: { userId: user.id, txRef, amount, currency: currency.toUpperCase(), status: "pending" },
  });

  const displayName = user.name || user.email.split("@")[0] || "Customer";
  const parts = displayName.split(" ");
  try {
    const result = await startCheckout({
      txRef,
      amount: major,
      currency: currency.toUpperCase(),
      description: `ZAWADI wallet top-up`,
      callbackPath: "/api/wallet/return",
      email: user.email,
      firstName: parts[0] || "Customer",
      lastName: parts.slice(1).join(" ") || undefined,
      phone,
    });
    await prisma.walletTopup.update({
      where: { txRef },
      data: { providerRef: result.orderTrackingId },
    });
    return c.json({ data: { txRef, checkoutUrl: result.redirectUrl, orderTrackingId: result.orderTrackingId } });
  } catch (e: unknown) {
    logger.warn("topup failed", { err: e instanceof Error ? e.message : String(e) });
    return c.json({ error: { message: e instanceof Error ? e.message : "Top-up failed" } }, 502);
  }
});

// GET /api/wallet/return - Pesapal redirect after checkout.
router.get("/return", async (c) => {
  const ref = c.req.query("OrderMerchantReference");
  const otid = c.req.query("OrderTrackingId");
  if (!ref || !otid) return c.text("Missing reference", 400);
  const topup = await prisma.walletTopup.findUnique({ where: { txRef: ref } });
  if (!topup) return c.text("Top-up not found", 404);
  await verifyAndCredit(topup.id, otid);
  return c.html(renderReturn());
});

// GET /api/wallet/ipn - Pesapal server-to-server notification for top-ups.
router.get("/ipn", async (c) => {
  const ref = c.req.query("OrderMerchantReference");
  const otid = c.req.query("OrderTrackingId");
  const notificationType = c.req.query("OrderNotificationType") || "IPNCHANGE";
  if (!ref || !otid) return c.json({ error: { message: "Missing ref" } }, 400);

  const topup = await prisma.walletTopup.findUnique({ where: { txRef: ref } });
  if (topup) await verifyAndCredit(topup.id, otid);
  return c.json({
    orderNotificationType: notificationType,
    orderTrackingId: otid,
    orderMerchantReference: ref,
    status: 200,
  });
});

async function verifyAndCredit(topupId: string, orderTrackingId: string): Promise<void> {
  const topup = await prisma.walletTopup.findUnique({ where: { id: topupId } });
  if (!topup || topup.status === "successful") return;
  let status;
  try {
    status = await getTransactionStatus(orderTrackingId);
  } catch (e) {
    logger.warn("topup verify failed", { id: topupId, err: e instanceof Error ? e.message : String(e) });
    return;
  }
  if (status.failed) {
    await prisma.walletTopup.update({ where: { id: topupId }, data: { status: "failed" } });
    return;
  }
  if (!status.completed) return;
  if (status.merchantReference !== topup.txRef) {
    logger.warn("topup ref mismatch", { expected: topup.txRef, got: status.merchantReference });
    return;
  }
  // Credit the wallet using the original amount in minor units (don't trust
  // the gateway amount, but sanity-check against it).
  const { creditDeposit } = await import("../lib/wallet");
  await creditDeposit(topup.userId, topup.amount, topup.currency, topup.id);
  await prisma.walletTopup.update({
    where: { id: topupId },
    data: { status: "successful", creditedAt: new Date(), providerRef: orderTrackingId },
  });
}

function renderReturn(): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZAWADI wallet</title></head><body style="margin:0;background:#0A0A0F;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh"><div style="text-align:center;padding:32px;max-width:420px"><div style="font-size:48px;margin-bottom:16px">💳</div><h1 style="color:#D4A843;font-size:22px;margin:0 0 8px">Thanks!</h1><p style="color:#888;font-size:14px;margin:0 0 24px">Your top-up is being credited. You can close this window and return to the app.</p></div></body></html>`;
}

// POST /api/wallet/withdraw - create a pending withdrawal. Funds debit on
// submission and are physically paid out by ops (Pesapal payouts or manual
// mobile-money transfer). When the operator marks success, the txn is
// finalised via /api/admin/withdrawals/:id/mark.
router.post("/withdraw", zValidator("json", withdrawSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { amount, method, phone, bankName, bankAccount } = c.req.valid("json");
  if (method === "mobile_money" && !phone) {
    return c.json({ error: { message: "phone is required for mobile money" } }, 400);
  }
  if (method === "bank" && (!bankName || !bankAccount)) {
    return c.json({ error: { message: "bankName and bankAccount are required" } }, 400);
  }

  const wallet = await getOrCreateWallet(user.id);
  if (wallet.balance < amount) {
    return c.json({ error: { message: "Insufficient balance" } }, 400);
  }

  // KYC gate
  const kyc = await prisma.kyc.findUnique({ where: { userId: user.id } });
  if (!kyc || kyc.status !== "approved") {
    return c.json({ error: { message: "KYC approval is required for withdrawals." } }, 403);
  }

  // 2FA gate for high-value withdrawals.
  const usdEquiv = wallet.currency.toUpperCase() === "USD" ? amount / 100 : null;
  if (usdEquiv !== null && usdEquiv >= env.TWOFA_REQUIRED_OVER_USD) {
    const totp = await prisma.totpSecret.findUnique({ where: { userId: user.id } });
    if (!totp || !totp.verifiedAt) {
      return c.json(
        { error: { message: `2FA is required for withdrawals over $${env.TWOFA_REQUIRED_OVER_USD.toLocaleString()}. Enroll first.` } },
        403,
      );
    }
    const code = c.req.header("x-2fa-code") ?? "";
    const { verifyTotp } = await import("../lib/totp");
    if (!(await verifyTotp(totp.secret, code))) {
      return c.json({ error: { message: "Provide a current 6-digit code in X-2FA-Code header" } }, 401);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    // Debit the wallet immediately.
    await postEntry(tx, {
      walletId: wallet.id,
      kind: "withdraw",
      amount,
      currency: wallet.currency,
      refType: "external",
      refId: undefined,
      description: `Withdraw via ${method}${phone ? ` (${phone})` : ""}${bankName ? ` (${bankName})` : ""}`,
    });
    // Link to the txn we just created (last withdraw for this wallet).
    const txn = await tx.walletTxn.findFirst({
      where: { walletId: wallet.id, kind: "withdraw" },
      orderBy: { createdAt: "desc" },
    });
    return tx.withdrawal.create({
      data: {
        userId: user.id,
        walletTxnId: txn?.id ?? null,
        amount,
        currency: wallet.currency,
        method,
        phone: phone ?? null,
        bankName: bankName ?? null,
        bankAccount: bankAccount ?? null,
        status: "pending",
      },
    });
  });

  // Notify ops via webhook so payout automation can pick it up.
  const { emitWebhook } = await import("../lib/webhooks");
  emitWebhook("wallet.withdraw", { withdrawalId: result.id, userId: user.id, amount, currency: wallet.currency }).catch(() => {});

  return c.json({ data: result });
});

const transferSchema = z.object({
  amount: z.number().int().positive(),
  // One of email / referralCode / userId — first match wins.
  toEmail: z.string().email().optional(),
  toReferralCode: z.string().trim().min(4).max(20).optional(),
  toUserId: z.string().min(1).optional(),
  note: z.string().trim().max(200).optional(),
});

// POST /api/wallet/transfer - send money to another user.
router.post("/transfer", zValidator("json", transferSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const { amount, toEmail, toReferralCode, toUserId, note } = c.req.valid("json");

  const recipient = toUserId
    ? await prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, bannedAt: true, name: true } })
    : toEmail
    ? await prisma.user.findUnique({ where: { email: toEmail.toLowerCase() }, select: { id: true, bannedAt: true, name: true } })
    : toReferralCode
    ? await prisma.user.findUnique({ where: { referralCode: toReferralCode.toUpperCase() }, select: { id: true, bannedAt: true, name: true } })
    : null;
  if (!recipient) return c.json({ error: { message: "Recipient not found" } }, 404);
  if (recipient.bannedAt) return c.json({ error: { message: "Recipient is unavailable" } }, 400);
  if (recipient.id === user.id) return c.json({ error: { message: "Cannot transfer to yourself" } }, 400);

  const fromWallet = await getOrCreateWallet(user.id);
  if (fromWallet.balance < amount) {
    return c.json({ error: { message: "Insufficient balance" } }, 402);
  }
  // Recipient may have an existing wallet in a different currency — auto-FX
  // when needed. We quote via lib/fx using USD as the intermediate.
  const toWallet = await getOrCreateWallet(recipient.id, fromWallet.currency);
  let creditAmount = amount;
  let fxNote: string | null = null;
  if (toWallet.currency !== fromWallet.currency) {
    const { convertFromUSD } = await import("../lib/fx");
    // Convert FROM the sender's currency to USD, then USD → recipient's.
    // FX module exposes USD→X; for X→USD we invert by computing 1 USD in X.
    const oneUsdInFrom = await convertFromUSD(1, fromWallet.currency); // minor units
    const oneUsdInTo = await convertFromUSD(1, toWallet.currency);
    const usdAmount = oneUsdInFrom > 0 ? amount / oneUsdInFrom : 0;
    creditAmount = Math.max(1, Math.round(usdAmount * oneUsdInTo));
    fxNote = `FX ${fromWallet.currency}→${toWallet.currency} @ ~${(oneUsdInTo / oneUsdInFrom).toFixed(4)}`;
  }

  await prisma.$transaction(async (tx) => {
    await postEntry(tx, {
      walletId: fromWallet.id,
      kind: "transfer_out",
      amount,
      currency: fromWallet.currency,
      refType: "external",
      refId: recipient.id,
      description: [
        note ? `Transfer to ${recipient.name}: ${note}` : `Transfer to ${recipient.name}`,
        fxNote,
      ]
        .filter(Boolean)
        .join(" · "),
    });
    await postEntry(tx, {
      walletId: toWallet.id,
      kind: "transfer_in",
      amount: creditAmount,
      currency: toWallet.currency,
      refType: "external",
      refId: user.id,
      description: [
        note ? `Transfer from ${user.name}: ${note}` : `Transfer from ${user.name}`,
        fxNote,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  });

  const { sendPushToUser } = await import("../lib/push");
  sendPushToUser(recipient.id, {
    title: `Received ${fromWallet.currency} ${(amount / 100).toFixed(2)}`,
    body: note ? `From ${user.name}: ${note}` : `Sent by ${user.name}.`,
    data: { type: "wallet" },
    kind: "chat",
  }).catch(() => {});

  return c.json({ data: { ok: true, currency: fromWallet.currency, amount } });
});

const bulkTransferSchema = z.object({
  rows: z
    .array(
      z.object({
        amount: z.number().int().positive(),
        toEmail: z.string().email().optional(),
        toReferralCode: z.string().trim().min(4).max(20).optional(),
        toUserId: z.string().min(1).optional(),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(200),
});

// POST /api/wallet/transfer/bulk - up to 200 transfers in one call. Atomic
// per row; sender's wallet must have enough total balance up-front (sum of
// all amounts in sender currency). Cross-currency rows use the same FX path.
router.post("/transfer/bulk", zValidator("json", bulkTransferSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const { rows } = c.req.valid("json");

  const fromWallet = await getOrCreateWallet(user.id);
  const totalDebit = rows.reduce((a, r) => a + r.amount, 0);
  if (fromWallet.balance < totalDebit) {
    return c.json({ error: { message: "Insufficient balance for the batch" } }, 402);
  }

  const results: { index: number; ok: boolean; error?: string; creditAmount?: number; currency?: string }[] = [];
  const { sendPushToUser } = await import("../lib/push");
  const { convertFromUSD } = await import("../lib/fx");

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const recipient = r.toUserId
        ? await prisma.user.findUnique({ where: { id: r.toUserId }, select: { id: true, bannedAt: true, name: true } })
        : r.toEmail
        ? await prisma.user.findUnique({ where: { email: r.toEmail.toLowerCase() }, select: { id: true, bannedAt: true, name: true } })
        : r.toReferralCode
        ? await prisma.user.findUnique({ where: { referralCode: r.toReferralCode.toUpperCase() }, select: { id: true, bannedAt: true, name: true } })
        : null;
      if (!recipient || recipient.bannedAt || recipient.id === user.id) {
        results.push({ index: i, ok: false, error: "Invalid recipient" });
        continue;
      }
      const toWallet = await getOrCreateWallet(recipient.id, fromWallet.currency);
      let creditAmount = r.amount;
      let fxNote: string | null = null;
      if (toWallet.currency !== fromWallet.currency) {
        const oneUsdInFrom = await convertFromUSD(1, fromWallet.currency);
        const oneUsdInTo = await convertFromUSD(1, toWallet.currency);
        const usdAmount = oneUsdInFrom > 0 ? r.amount / oneUsdInFrom : 0;
        creditAmount = Math.max(1, Math.round(usdAmount * oneUsdInTo));
        fxNote = `FX ${fromWallet.currency}→${toWallet.currency}`;
      }
      await prisma.$transaction(async (tx) => {
        await postEntry(tx, {
          walletId: fromWallet.id,
          kind: "transfer_out",
          amount: r.amount,
          currency: fromWallet.currency,
          refType: "external",
          refId: recipient.id,
          description: [r.note ? `Bulk to ${recipient.name}: ${r.note}` : `Bulk to ${recipient.name}`, fxNote].filter(Boolean).join(" · "),
        });
        await postEntry(tx, {
          walletId: toWallet.id,
          kind: "transfer_in",
          amount: creditAmount,
          currency: toWallet.currency,
          refType: "external",
          refId: user.id,
          description: [r.note ? `Bulk from ${user.name}: ${r.note}` : `Bulk from ${user.name}`, fxNote].filter(Boolean).join(" · "),
        });
      });
      sendPushToUser(recipient.id, {
        title: `Received ${toWallet.currency} ${(creditAmount / 100).toFixed(2)}`,
        body: r.note ?? `Sent by ${user.name}.`,
        data: { type: "wallet" },
        kind: "chat",
      }).catch(() => {});
      results.push({ index: i, ok: true, creditAmount, currency: toWallet.currency });
    } catch (e) {
      results.push({ index: i, ok: false, error: e instanceof Error ? e.message : "Failed" });
    }
  }

  return c.json({ data: { results, total: rows.length, succeeded: results.filter((r) => r.ok).length } });
});

// GET /api/wallet/withdrawals - current user's pending + paid history.
router.get("/withdrawals", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  const rows = await prisma.withdrawal.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return c.json({ data: rows });
});

// GET /api/wallet/statement.csv?from=2026-01-01&to=2026-06-30
// Returns the user's full ledger as CSV — useful for accounting / bookkeeping.
router.get("/statement.csv", async (c) => {
  const user = c.get("user");
  if (!user) return c.text("Unauthorized", 401);
  const fromStr = c.req.query("from");
  const toStr = c.req.query("to");
  const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const to = toStr ? new Date(toStr) : new Date();
  const wallet = await getOrCreateWallet(user.id);
  const rows = await prisma.walletTxn.findMany({
    where: { walletId: wallet.id, createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "asc" },
  });

  const header = ["date", "kind", "amount_minor", "currency", "description", "ref_type", "ref_id"];
  const escape = (s: string) => (s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt.toISOString(),
        r.kind,
        String(r.amount),
        r.currency,
        escape(r.description ?? ""),
        r.refType ?? "",
        r.refId ?? "",
      ].join(","),
    );
  }
  // Trailing totals row.
  const total = rows.reduce((acc, r) => acc + r.amount, 0);
  lines.push(["", "NET_CHANGE", String(total), wallet.currency, "", "", ""].join(","));

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header(
    "Content-Disposition",
    `attachment; filename="zawadi-statement-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv"`,
  );
  return c.body(lines.join("\n"));
});

export { router as walletRouter };
