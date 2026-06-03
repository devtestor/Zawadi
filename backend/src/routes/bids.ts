import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { auctionConfigSchema, bidSchema } from "../lib/schemas";
import { env } from "../env";
import { sendPushToUser } from "../lib/push";
import { getOrCreateWallet, postEntry } from "../lib/wallet";
import { logger } from "../lib/logger";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

// POST /api/listings/:listingId/auction - owner configures the auction.
// (Mounted on this router so the URL ends up `/api/bids/listing/:listingId/auction`.)
router.post("/listing/:listingId/auction", zValidator("json", auctionConfigSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { listingId } = c.req.param();
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return c.json({ error: { message: "Not found" } }, 404);
  if (listing.userId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);

  const { endsAt, minBid, reservePrice, bidIncrement } = c.req.valid("json");
  const end = new Date(endsAt);
  if (end.getTime() < Date.now() + 60_000) {
    return c.json({ error: { message: "Auction must end at least 1 minute from now" } }, 400);
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      auctionEndsAt: end,
      auctionClosed: false,
      minBid,
      reservePrice: reservePrice ?? null,
      bidIncrement: bidIncrement ?? null,
    },
  });
  return c.json({ data: updated });
});

// GET /api/bids/listing/:listingId - list bids for a listing
router.get("/listing/:listingId", async (c) => {
  const { listingId } = c.req.param();
  const bids = await prisma.bid.findMany({
    where: { listingId },
    include: { bidder: { select: { id: true, name: true, image: true } } },
    orderBy: { amount: "desc" },
    take: 50,
  });
  return c.json({ data: bids });
});

// POST /api/bids/listing/:listingId - place a bid
router.post("/listing/:listingId", zValidator("json", bidSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { listingId } = c.req.param();
  const { amount, maxAmount } = c.req.valid("json");

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      userId: true,
      auctionEndsAt: true,
      auctionClosed: true,
      minBid: true,
      bidIncrement: true,
      currency: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!listing || listing.deletedAt) return c.json({ error: { message: "Listing not found" } }, 404);
  if (!listing.auctionEndsAt || listing.auctionClosed) {
    return c.json({ error: { message: "Listing is not an open auction" } }, 400);
  }
  if (listing.auctionEndsAt.getTime() <= Date.now()) {
    return c.json({ error: { message: "Auction has ended" } }, 400);
  }
  if (listing.userId === user.id) return c.json({ error: { message: "You can't bid on your own listing" } }, 400);

  // Validate vs. current high bid.
  const top = await prisma.bid.findFirst({
    where: { listingId, status: "active" },
    orderBy: { amount: "desc" },
  });
  const floor = top
    ? top.amount + (listing.bidIncrement ?? 100) // default +1 unit
    : (listing.minBid ?? 0);
  if (amount < floor) {
    return c.json({ error: { message: `Bid must be at least ${listing.currency} ${(floor / 100).toFixed(2)}` } }, 400);
  }
  if (maxAmount && maxAmount < amount) {
    return c.json({ error: { message: "maxAmount must be >= amount" } }, 400);
  }

  // Check the bidder has enough free balance to cover the bid.
  const bidderWallet = await getOrCreateWallet(user.id, listing.currency.toUpperCase());
  if (bidderWallet.balance < amount) {
    return c.json(
      {
        error: {
          message: `Insufficient wallet balance to back this bid. Top up at least ${listing.currency} ${(amount / 100).toFixed(2)} first.`,
        },
      },
      402,
    );
  }

  // Mark prior top bid as outbid (and refund their hold), place the new bid
  // with an escrow hold.
  const bid = await prisma.$transaction(async (tx) => {
    if (top) {
      await tx.bid.update({ where: { id: top.id }, data: { status: "outbid" } });
      if (top.holdTxnId) {
        // Refund the prior top bidder's hold.
        const prevWallet = await tx.wallet.findUnique({ where: { userId: top.bidderId } });
        if (prevWallet) {
          await postEntry(tx, {
            walletId: prevWallet.id,
            kind: "escrow_refund",
            amount: top.amount,
            currency: prevWallet.currency,
            refType: "external",
            refId: top.id,
            description: `Refund — outbid on listing ${listingId}`,
          });
        }
      }
    }

    // Hold the new bid amount.
    await postEntry(tx, {
      walletId: bidderWallet.id,
      kind: "escrow_hold",
      amount,
      currency: bidderWallet.currency,
      refType: "external",
      refId: undefined,
      description: `Bid hold on listing ${listingId}`,
    });
    const holdTxn = await tx.walletTxn.findFirst({
      where: { walletId: bidderWallet.id, kind: "escrow_hold" },
      orderBy: { createdAt: "desc" },
    });

    return tx.bid.create({
      data: {
        listingId,
        bidderId: user.id,
        amount,
        currency: listing.currency.toUpperCase(),
        maxAmount: maxAmount ?? null,
        holdTxnId: holdTxn?.id ?? null,
      },
    });
  });

  // --- Proxy bidding ---
  // If any earlier bidder still has a maxAmount > the new top, auto-raise them
  // by one increment up to (a) their own maxAmount and (b) just above the
  // current top. We keep iterating until no eligible auto-bidder remains.
  // The new bid we just placed counts as the current top.
  let currentTop = bid;
  while (true) {
    const challenger = await prisma.bid.findFirst({
      where: {
        listingId,
        status: "outbid",
        bidderId: { not: currentTop.bidderId },
        maxAmount: { gt: currentTop.amount },
      },
      orderBy: [{ maxAmount: "desc" }, { createdAt: "asc" }],
    });
    if (!challenger || !challenger.maxAmount) break;
    const inc = listing.bidIncrement ?? 100;
    const proposed = Math.min(challenger.maxAmount, currentTop.amount + inc);
    if (proposed <= currentTop.amount) break;

    // Need available balance to back the auto-raise (subtract their existing hold).
    const cWallet = await getOrCreateWallet(challenger.bidderId, listing.currency.toUpperCase());
    const free = cWallet.balance + (challenger.holdTxnId ? challenger.amount : 0);
    if (free < proposed) {
      // Skip and rank them as rejected so they're not retried in an infinite loop.
      await prisma.bid.update({ where: { id: challenger.id }, data: { status: "withdrawn" } });
      continue;
    }

    // Step 1: refund their old hold. Step 2: hold the new amount. Step 3:
    // mark current top as outbid + create the auto-raise as a new bid.
    const replacement = await prisma.$transaction(async (tx) => {
      if (challenger.holdTxnId) {
        await postEntry(tx, {
          walletId: cWallet.id,
          kind: "escrow_refund",
          amount: challenger.amount,
          currency: cWallet.currency,
          refType: "external",
          refId: challenger.id,
          description: "Proxy bid — refund prior amount",
        });
      }
      await postEntry(tx, {
        walletId: cWallet.id,
        kind: "escrow_hold",
        amount: proposed,
        currency: cWallet.currency,
        refType: "external",
        refId: undefined,
        description: `Proxy bid hold on listing ${listingId}`,
      });
      const holdTxn = await tx.walletTxn.findFirst({
        where: { walletId: cWallet.id, kind: "escrow_hold" },
        orderBy: { createdAt: "desc" },
      });
      await tx.bid.update({ where: { id: currentTop.id }, data: { status: "outbid" } });
      return tx.bid.create({
        data: {
          listingId,
          bidderId: challenger.bidderId,
          amount: proposed,
          currency: cWallet.currency,
          maxAmount: challenger.maxAmount,
          holdTxnId: holdTxn?.id ?? null,
          status: "active",
        },
      });
    });
    currentTop = replacement;
    sendPushToUser(currentTop.bidderId, {
      title: "Proxy bid placed",
      body: `Your max bid was used to outbid — now at ${listing.currency} ${(currentTop.amount / 100).toFixed(2)}.`,
      data: { type: "bid", listingId },
      kind: "chat",
    }).catch(() => {});
  }

  // Notify the previous high bidder + the seller.
  if (top && top.bidderId !== user.id) {
    sendPushToUser(top.bidderId, {
      title: "You've been outbid",
      body: `New top bid: ${listing.currency} ${(amount / 100).toFixed(2)}`,
      data: { type: "bid", listingId },
      kind: "chat",
    }).catch(() => {});
  }
  sendPushToUser(listing.userId, {
    title: "New bid",
    body: `${listing.currency} ${(amount / 100).toFixed(2)} on your auction.`,
    data: { type: "bid", listingId },
    kind: "chat",
  }).catch(() => {});

  return c.json({ data: bid }, 201);
});

// POST /api/bids/:id/withdraw - bidder pulls a bid (only before auction ends).
router.post("/:id/withdraw", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  const bid = await prisma.bid.findUnique({ where: { id }, include: { listing: true } });
  if (!bid) return c.json({ error: { message: "Not found" } }, 404);
  if (bid.bidderId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);
  if (bid.status !== "active") return c.json({ error: { message: "Bid is not active" } }, 400);
  if (bid.listing.auctionEndsAt && bid.listing.auctionEndsAt.getTime() <= Date.now()) {
    return c.json({ error: { message: "Auction has ended" } }, 400);
  }
  // Refund the bidder's hold, mark withdrawn.
  await prisma.$transaction(async (tx) => {
    if (bid.holdTxnId) {
      const w = await tx.wallet.findUnique({ where: { userId: bid.bidderId } });
      if (w) {
        await postEntry(tx, {
          walletId: w.id,
          kind: "escrow_refund",
          amount: bid.amount,
          currency: w.currency,
          refType: "external",
          refId: bid.id,
          description: "Bid withdrawn",
        });
      }
    }
    await tx.bid.update({ where: { id }, data: { status: "withdrawn" } });
  });
  return c.json({ data: { ok: true } });
});

// Used by the scanner — exported but never bound to a route.
export async function closeAuctionsOnce(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - env.AUCTION_GRACE_SECONDS * 1000);
  const ready = await prisma.listing.findMany({
    where: {
      auctionClosed: false,
      auctionEndsAt: { lt: cutoff },
      deletedAt: null,
    },
    select: { id: true, userId: true, currency: true, reservePrice: true },
    take: 50,
  });

  let closed = 0;
  for (const listing of ready) {
    const top = await prisma.bid.findFirst({
      where: { listingId: listing.id, status: "active" },
      orderBy: { amount: "desc" },
    });
    await prisma.listing.update({ where: { id: listing.id }, data: { auctionClosed: true } });
    if (!top) continue;
    if (listing.reservePrice && top.amount < listing.reservePrice) {
      await prisma.bid.update({ where: { id: top.id }, data: { status: "rejected" } });
      continue;
    }
    // Winner — convert the bid's existing hold into the trade's escrow. The
    // hold is already on pendingDebit, so we don't post a second escrow_hold;
    // we just relabel it via a note and create the trade in `in_escrow`.
    await prisma.$transaction(async (tx) => {
      const trade = await tx.trade.create({
        data: {
          listingId: listing.id,
          buyerId: top.bidderId,
          sellerId: listing.userId,
          amount: top.amount,
          currency: top.currency,
          status: top.holdTxnId ? "in_escrow" : "initiated",
          fundedAt: top.holdTxnId ? new Date() : null,
          escrowedAt: top.holdTxnId ? new Date() : null,
          bidId: top.id,
        },
      });
      await tx.bid.update({ where: { id: top.id }, data: { status: "won" } });
      await tx.tradeEvent.create({
        data: {
          tradeId: trade.id,
          kind: top.holdTxnId ? "in_escrow" : "initiated",
          note: "auction_won",
        },
      });
      if (top.holdTxnId) {
        // Re-link the original hold txn to the new trade ref for the audit trail.
        await tx.walletTxn.update({
          where: { id: top.holdTxnId },
          data: { refType: "trade", refId: trade.id, description: "Bid hold converted to trade escrow" },
        });
      }
    });
    // Refund every loser still active for this listing.
    const losers = await prisma.bid.findMany({
      where: { listingId: listing.id, status: { in: ["active", "outbid"] }, holdTxnId: { not: null } },
      select: { id: true, amount: true, currency: true, bidderId: true, holdTxnId: true },
    });
    for (const loser of losers) {
      try {
        const w = await prisma.wallet.findUnique({ where: { userId: loser.bidderId } });
        if (!w) continue;
        await prisma.$transaction(async (tx) => {
          await postEntry(tx, {
            walletId: w.id,
            kind: "escrow_refund",
            amount: loser.amount,
            currency: w.currency,
            refType: "external",
            refId: loser.id,
            description: "Bid refund — auction ended",
          });
          await tx.bid.update({ where: { id: loser.id }, data: { status: "rejected" } });
        });
      } catch (e) {
        logger.warn("loser refund failed", { bidId: loser.id, err: e instanceof Error ? e.message : String(e) });
      }
    }
    closed += 1;
    sendPushToUser(top.bidderId, {
      title: "You won the auction",
      body: `Time to fund your trade.`,
      data: { type: "bid", listingId: listing.id },
      kind: "chat",
    }).catch(() => {});
  }
  return closed;
}

export { router as bidsRouter };
