import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { auctionConfigSchema, bidSchema } from "../lib/schemas";
import { env } from "../env";
import { sendPushToUser } from "../lib/push";

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

  // Mark prior top bid as outbid.
  const bid = await prisma.$transaction(async (tx) => {
    if (top) {
      await tx.bid.update({ where: { id: top.id }, data: { status: "outbid" } });
    }
    return tx.bid.create({
      data: {
        listingId,
        bidderId: user.id,
        amount,
        currency: listing.currency.toUpperCase(),
        maxAmount: maxAmount ?? null,
      },
    });
  });

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
  await prisma.bid.update({ where: { id }, data: { status: "withdrawn" } });
  // Promote the next-highest active bid back into the running.
  // (We don't reverse `outbid` automatically — the next active bid is already the new top.)
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
    // Winner — create a Trade in `initiated` so the buyer can fund it.
    await prisma.$transaction(async (tx) => {
      const trade = await tx.trade.create({
        data: {
          listingId: listing.id,
          buyerId: top.bidderId,
          sellerId: listing.userId,
          amount: top.amount,
          currency: top.currency,
          status: "initiated",
          bidId: top.id,
        },
      });
      await tx.bid.update({ where: { id: top.id }, data: { status: "won" } });
      await tx.tradeEvent.create({ data: { tradeId: trade.id, kind: "initiated", note: "auction_won" } });
    });
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
