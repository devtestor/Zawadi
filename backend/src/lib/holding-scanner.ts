import { prisma } from "../prisma";
import { logger } from "./logger";
import { getOrCreateWallet, postEntry } from "./wallet";
import { sendPushToUser } from "./push";
import { emailReceiptToParties } from "./receipts";
import { emitWebhook } from "./webhooks";

// Auto-release escrow for trades that have been `delivered` past their
// `releaseDueAt` without the buyer disputing or confirming. Mirrors the buyer
// `confirm` action in routes/trades.ts.

const TICK_MS = 5 * 60 * 1000;

async function releaseOne(tradeId: string): Promise<void> {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade || trade.status !== "delivered") return;

  const buyerWallet = await getOrCreateWallet(trade.buyerId, trade.currency);
  const sellerWallet = await getOrCreateWallet(trade.sellerId, trade.currency);
  const fee = trade.feeAmount;
  const sellerCredit = trade.amount - fee;

  await prisma.$transaction(async (tx) => {
    // Buyer side: remove the hold; money has left the wallet.
    await tx.walletTxn.create({
      data: {
        walletId: buyerWallet.id,
        kind: "transfer_out",
        amount: -trade.amount,
        currency: trade.currency,
        refType: "trade",
        refId: trade.id,
        description: "Escrow auto-released (holding period elapsed)",
      },
    });
    await tx.wallet.update({
      where: { id: buyerWallet.id },
      data: { pendingDebit: { decrement: trade.amount } },
    });
    // Seller side: credit balance less fee.
    await postEntry(tx, {
      walletId: sellerWallet.id,
      kind: "escrow_release",
      amount: sellerCredit,
      currency: trade.currency,
      refType: "trade",
      refId: trade.id,
      description: "Escrow auto-release",
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
      data: { tradeId: trade.id, kind: "completed", actorId: null, note: "auto_release" },
    });
    await tx.user.update({ where: { id: trade.buyerId }, data: { tradeCount: { increment: 1 } } });
    await tx.user.update({ where: { id: trade.sellerId }, data: { tradeCount: { increment: 1 } } });
    await tx.listing.update({ where: { id: trade.listingId }, data: { status: "sold" } }).catch(() => {});
  });

  sendPushToUser(trade.sellerId, {
    title: "Funds released",
    body: `${trade.currency} ${(sellerCredit / 100).toFixed(2)} auto-released from escrow.`,
    data: { type: "trade", tradeId: trade.id },
    kind: "chat",
  }).catch(() => {});
  sendPushToUser(trade.buyerId, {
    title: "Trade auto-completed",
    body: "We released your escrow to the seller. Leave a review.",
    data: { type: "trade", tradeId: trade.id },
    kind: "chat",
  }).catch(() => {});

  emailReceiptToParties(trade.id).catch(() => {});
  emitWebhook("trade.completed", { tradeId: trade.id, source: "auto_release" }).catch(() => {});
}

export async function runHoldingTick(): Promise<void> {
  return tick();
}

async function tick(): Promise<void> {
  const now = new Date();
  const due = await prisma.trade.findMany({
    where: {
      status: "delivered",
      releaseDueAt: { not: null, lte: now },
    },
    select: { id: true },
    take: 50,
  });
  for (const t of due) {
    try {
      await releaseOne(t.id);
    } catch (e) {
      logger.warn("auto-release failed", { tradeId: t.id, err: e instanceof Error ? e.message : String(e) });
    }
  }
}

export function startHoldingPeriodScanner(): void {
  setTimeout(() => tick().catch((e) => logger.warn("holding tick failed", { err: String(e) })), 60_000);
  setInterval(() => tick().catch((e) => logger.warn("holding tick failed", { err: String(e) })), TICK_MS);
}
