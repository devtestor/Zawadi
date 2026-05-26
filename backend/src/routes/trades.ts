import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { tradeStartSchema, tradeActionSchema } from "../lib/schemas";
import { env } from "../env";
import { getOrCreateWallet, postEntry, feeAmount } from "../lib/wallet";
import { convertFromUSD } from "../lib/fx";
import { sendPushToUser } from "../lib/push";
import { logger } from "../lib/logger";
import * as chain from "../lib/chain";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

const TERMINAL = new Set(["completed", "refunded", "cancelled"]);

async function recordEvent(tradeId: string, kind: string, actorId: string | null, note?: string) {
  await prisma.tradeEvent.create({
    data: { tradeId, kind, actorId, note: note ?? null },
  });
}

// Fire-and-forget chain anchor for a transition. Updates the last matching
// TradeEvent row with the resulting tx hash. Never throws.
function anchor(tradeId: string, kind: string, fn: () => Promise<`0x${string}` | null>) {
  if (!chain.isChainEnabled()) return;
  fn()
    .then(async (hash) => {
      if (!hash) return;
      // Update the most recent event with the matching kind.
      const ev = await prisma.tradeEvent.findFirst({
        where: { tradeId, kind },
        orderBy: { createdAt: "desc" },
      });
      if (ev) {
        await prisma.tradeEvent.update({
          where: { id: ev.id },
          data: { chainTxHash: hash, chainName: process.env.CHAIN_NAME ?? null },
        });
      }
    })
    .catch(() => {});
}

// GET /api/trades - list current user's trades (buyer + seller)
router.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const role = c.req.query("role"); // optional "buyer" | "seller"
  const where: Record<string, unknown> =
    role === "buyer"
      ? { buyerId: user.id }
      : role === "seller"
      ? { sellerId: user.id }
      : { OR: [{ buyerId: user.id }, { sellerId: user.id }] };

  const trades = await prisma.trade.findMany({
    where,
    include: {
      listing: { select: { id: true, title: true, images: { take: 1, orderBy: { order: "asc" } } } },
      buyer: { select: { id: true, name: true, image: true } },
      seller: { select: { id: true, name: true, image: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return c.json({ data: trades });
});

// GET /api/trades/:id - single trade with full timeline
router.get("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  const trade = await prisma.trade.findUnique({
    where: { id },
    include: {
      listing: { select: { id: true, title: true, price: true, currency: true, images: { take: 1, orderBy: { order: "asc" } } } },
      buyer: { select: { id: true, name: true, image: true } },
      seller: { select: { id: true, name: true, image: true } },
      contract: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!trade) return c.json({ error: { message: "Not found" } }, 404);
  if (trade.buyerId !== user.id && trade.sellerId !== user.id) {
    return c.json({ error: { message: "Forbidden" } }, 403);
  }
  return c.json({ data: trade });
});

// POST /api/trades - start a new trade (buyer initiates).
router.post("/", zValidator("json", tradeStartSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { listingId, amount } = c.req.valid("json");
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, userId: true, price: true, currency: true, status: true, deletedAt: true },
  });
  if (!listing || listing.deletedAt) return c.json({ error: { message: "Listing not found" } }, 404);
  if (listing.userId === user.id) return c.json({ error: { message: "You can't buy your own listing" } }, 400);
  if (listing.status !== "active") return c.json({ error: { message: "Listing is not active" } }, 400);

  const finalAmount = amount ?? Math.round(listing.price * 100); // price is float, convert to minor
  const currency = listing.currency.toUpperCase();
  const usdEquiv = currency === "USD" ? finalAmount / 100 : null;

  // KYC gate
  if (usdEquiv !== null && usdEquiv >= env.KYC_REQUIRED_OVER_USD) {
    const kyc = await prisma.kyc.findUnique({ where: { userId: user.id } });
    if (!kyc || kyc.status !== "approved") {
      return c.json(
        { error: { message: `KYC approval required for trades over $${env.KYC_REQUIRED_OVER_USD.toLocaleString()}.` } },
        403,
      );
    }
  }

  const trade = await prisma.$transaction(async (tx) => {
    const t = await tx.trade.create({
      data: {
        listingId,
        buyerId: user.id,
        sellerId: listing.userId,
        amount: finalAmount,
        currency,
        feeAmount: feeAmount(finalAmount),
        status: "initiated",
      },
    });
    await tx.tradeEvent.create({ data: { tradeId: t.id, kind: "initiated", actorId: user.id } });
    return t;
  });

  // Notify seller
  sendPushToUser(listing.userId, {
    title: "New trade offer",
    body: `A buyer has started a trade on your listing.`,
    data: { type: "trade", tradeId: trade.id },
    kind: "chat",
  }).catch(() => {});

  // Best-effort on-chain anchor: record the agreement creation.
  if (chain.isChainEnabled()) {
    chain
      .createAgreement({
        tradeId: trade.id,
        buyerUserId: trade.buyerId,
        sellerUserId: trade.sellerId,
        amount: trade.amount,
        currency: trade.currency,
      })
      .then(async (hash) => {
        if (!hash) return;
        await prisma.trade.update({
          where: { id: trade.id },
          data: {
            chainAddress: process.env.CHAIN_ESCROW_FACTORY ?? null,
            chainName: process.env.CHAIN_NAME ?? null,
            chainTradeId: chain.tradeIdToBytes32(trade.id),
          },
        });
        await prisma.tradeEvent.updateMany({
          where: { tradeId: trade.id, kind: "initiated" },
          data: { chainTxHash: hash, chainName: process.env.CHAIN_NAME ?? null },
        });
      })
      .catch(() => {});
  }

  return c.json({ data: trade }, 201);
});

// POST /api/trades/:id/action - state machine transitions
router.post("/:id/action", zValidator("json", tradeActionSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  const { action } = c.req.valid("json");
  const trade = await prisma.trade.findUnique({
    where: { id },
    include: { contract: true },
  });
  if (!trade) return c.json({ error: { message: "Not found" } }, 404);
  if (trade.buyerId !== user.id && trade.sellerId !== user.id) {
    return c.json({ error: { message: "Forbidden" } }, 403);
  }
  if (TERMINAL.has(trade.status)) {
    return c.json({ error: { message: `Trade is already ${trade.status}` } }, 400);
  }

  const isBuyer = trade.buyerId === user.id;
  const isSeller = trade.sellerId === user.id;

  // === fund (buyer): move money from wallet into escrow hold ===
  if (action === "fund") {
    if (!isBuyer) return c.json({ error: { message: "Only the buyer can fund" } }, 403);
    if (trade.status !== "initiated") {
      return c.json({ error: { message: `Cannot fund from ${trade.status}` } }, 400);
    }
    // Contract must be signed by both parties if one exists.
    if (trade.contract && trade.contract.status !== "active") {
      return c.json({ error: { message: "Contract is not fully signed" } }, 400);
    }
    const buyerWallet = await getOrCreateWallet(user.id, trade.currency);
    if (buyerWallet.balance < trade.amount) {
      return c.json({ error: { message: "Insufficient wallet balance — top up first" } }, 402);
    }
    await prisma.$transaction(async (tx) => {
      await postEntry(tx, {
        walletId: buyerWallet.id,
        kind: "escrow_hold",
        amount: trade.amount,
        currency: trade.currency,
        refType: "trade",
        refId: trade.id,
        description: `Escrow hold for trade ${trade.id}`,
      });
      await tx.trade.update({
        where: { id: trade.id },
        data: { status: "in_escrow", fundedAt: new Date(), escrowedAt: new Date() },
      });
      await tx.tradeEvent.create({ data: { tradeId: trade.id, kind: "in_escrow", actorId: user.id } });
    });
    sendPushToUser(trade.sellerId, {
      title: "Funds in escrow",
      body: "The buyer has funded the trade. Time to deliver.",
      data: { type: "trade", tradeId: trade.id },
      kind: "chat",
    }).catch(() => {});
    anchor(trade.id, "in_escrow", () => chain.markFunded(trade.id));
    return c.json({ data: { ok: true } });
  }

  // === deliver (seller): mark goods/keys/title handed over ===
  if (action === "deliver") {
    if (!isSeller) return c.json({ error: { message: "Only the seller can mark delivered" } }, 403);
    if (trade.status !== "in_escrow") {
      return c.json({ error: { message: `Cannot deliver from ${trade.status}` } }, 400);
    }
    await prisma.$transaction([
      prisma.trade.update({
        where: { id: trade.id },
        data: { status: "delivered", deliveredAt: new Date() },
      }),
      prisma.tradeEvent.create({ data: { tradeId: trade.id, kind: "delivered", actorId: user.id } }),
    ]);
    sendPushToUser(trade.buyerId, {
      title: "Item delivered",
      body: "The seller marked your trade as delivered. Confirm receipt to release escrow.",
      data: { type: "trade", tradeId: trade.id },
      kind: "chat",
    }).catch(() => {});
    anchor(trade.id, "delivered", () => chain.markDelivered(trade.id));
    return c.json({ data: { ok: true } });
  }

  // === confirm (buyer): release escrow to seller minus fee ===
  if (action === "confirm") {
    if (!isBuyer) return c.json({ error: { message: "Only the buyer can confirm" } }, 403);
    if (trade.status !== "delivered") {
      return c.json({ error: { message: `Cannot confirm from ${trade.status}` } }, 400);
    }
    const buyerWallet = await getOrCreateWallet(trade.buyerId, trade.currency);
    const sellerWallet = await getOrCreateWallet(trade.sellerId, trade.currency);
    const fee = trade.feeAmount;
    const sellerCredit = trade.amount - fee;

    await prisma.$transaction(async (tx) => {
      // Buyer side: remove the hold (does not credit balance — money leaves).
      await tx.walletTxn.create({
        data: {
          walletId: buyerWallet.id,
          kind: "transfer_out",
          amount: -trade.amount,
          currency: trade.currency,
          refType: "trade",
          refId: trade.id,
          description: "Escrow released to seller",
        },
      });
      await tx.wallet.update({
        where: { id: buyerWallet.id },
        data: { pendingDebit: { decrement: trade.amount } },
      });

      // Seller side: credit balance (less fee)
      await postEntry(tx, {
        walletId: sellerWallet.id,
        kind: "escrow_release",
        amount: sellerCredit,
        currency: trade.currency,
        refType: "trade",
        refId: trade.id,
        description: "Escrow release",
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
      await tx.tradeEvent.create({ data: { tradeId: trade.id, kind: "completed", actorId: user.id } });
      await tx.user.update({
        where: { id: trade.buyerId },
        data: { tradeCount: { increment: 1 } },
      });
      await tx.user.update({
        where: { id: trade.sellerId },
        data: { tradeCount: { increment: 1 } },
      });
      // Auto-mark the listing as sold.
      await tx.listing.update({ where: { id: trade.listingId }, data: { status: "sold" } });
    });
    sendPushToUser(trade.sellerId, {
      title: "Payment released",
      body: `Trade completed. ${trade.currency} ${(sellerCredit / 100).toFixed(2)} credited.`,
      data: { type: "trade", tradeId: trade.id },
      kind: "chat",
    }).catch(() => {});
    anchor(trade.id, "completed", () => chain.markCompleted(trade.id));
    return c.json({ data: { ok: true } });
  }

  // === cancel (buyer or seller, only before escrow) ===
  if (action === "cancel") {
    if (trade.status !== "initiated") {
      return c.json({ error: { message: "Can only cancel an initiated trade" } }, 400);
    }
    await prisma.$transaction([
      prisma.trade.update({
        where: { id: trade.id },
        data: { status: "cancelled", cancelledAt: new Date() },
      }),
      prisma.tradeEvent.create({ data: { tradeId: trade.id, kind: "cancelled", actorId: user.id } }),
    ]);
    anchor(trade.id, "cancelled", () => chain.markCancelled(trade.id));
    return c.json({ data: { ok: true } });
  }

  // === refund (seller agrees, or admin) — releases the hold back to buyer ===
  if (action === "refund") {
    if (!(isSeller || trade.status === "disputed")) {
      return c.json({ error: { message: "Only seller or admin can refund" } }, 403);
    }
    if (trade.status !== "in_escrow" && trade.status !== "delivered" && trade.status !== "disputed") {
      return c.json({ error: { message: `Cannot refund from ${trade.status}` } }, 400);
    }
    const buyerWallet = await getOrCreateWallet(trade.buyerId, trade.currency);
    await prisma.$transaction(async (tx) => {
      await postEntry(tx, {
        walletId: buyerWallet.id,
        kind: "escrow_refund",
        amount: trade.amount,
        currency: trade.currency,
        refType: "trade",
        refId: trade.id,
        description: "Escrow refunded",
      });
      await tx.trade.update({
        where: { id: trade.id },
        data: { status: "refunded", refundedAt: new Date() },
      });
      await tx.tradeEvent.create({ data: { tradeId: trade.id, kind: "refunded", actorId: user.id } });
    });
    sendPushToUser(trade.buyerId, {
      title: "Trade refunded",
      body: "Escrow has been returned to your wallet.",
      data: { type: "trade", tradeId: trade.id },
      kind: "chat",
    }).catch(() => {});
    anchor(trade.id, "refunded", () => chain.markRefunded(trade.id));
    return c.json({ data: { ok: true } });
  }

  // === dispute (either side) — freezes the trade for admin attention ===
  if (action === "dispute") {
    if (trade.status !== "in_escrow" && trade.status !== "delivered") {
      return c.json({ error: { message: `Cannot dispute from ${trade.status}` } }, 400);
    }
    await prisma.$transaction([
      prisma.trade.update({ where: { id: trade.id }, data: { status: "disputed" } }),
      prisma.tradeEvent.create({ data: { tradeId: trade.id, kind: "disputed", actorId: user.id } }),
    ]);
    logger.warn("trade disputed", { tradeId: trade.id, actorId: user.id });
    anchor(trade.id, "disputed", () => chain.markDisputed(trade.id));
    return c.json({ data: { ok: true } });
  }

  return c.json({ error: { message: "Unknown action" } }, 400);
});

export { router as tradesRouter };
