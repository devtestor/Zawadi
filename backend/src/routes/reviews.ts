import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(1000).optional(),
  // Optional — when set, the review is anchored to a completed trade.
  tradeId: z.string().min(1).optional(),
});

// GET /api/reviews/user/:userId - list reviews for a user + summary
router.get("/user/:userId", async (c) => {
  const { userId } = c.req.param();
  const [reviews, summary, target] = await Promise.all([
    prisma.review.findMany({
      where: { subjectId: userId },
      include: { author: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.review.aggregate({
      where: { subjectId: userId },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        image: true,
        verifiedAt: true,
        role: true,
        businessName: true,
        tradeCount: true,
        ratingSum: true,
        ratingCount: true,
        createdAt: true,
      },
    }),
  ]);
  if (!target) return c.json({ error: { message: "User not found" } }, 404);

  return c.json({
    data: {
      user: target,
      summary: {
        average: summary._avg.rating ?? null,
        count: summary._count._all,
      },
      reviews,
    },
  });
});

// POST /api/reviews/user/:userId - create or update a review (one per author per subject)
router.post("/user/:userId", zValidator("json", reviewSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { userId } = c.req.param();
  if (userId === user.id) return c.json({ error: { message: "You cannot review yourself" } }, 400);

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return c.json({ error: { message: "User not found" } }, 404);

  const { rating, body, tradeId } = c.req.valid("json");

  // If anchoring to a trade, validate participation + completion.
  if (tradeId) {
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade) return c.json({ error: { message: "Trade not found" } }, 404);
    if (trade.status !== "completed") {
      return c.json({ error: { message: "Trade must be completed to leave a review" } }, 400);
    }
    if (trade.buyerId !== user.id && trade.sellerId !== user.id) {
      return c.json({ error: { message: "Only trade participants can review" } }, 403);
    }
    const otherParty = trade.buyerId === user.id ? trade.sellerId : trade.buyerId;
    if (otherParty !== userId) {
      return c.json({ error: { message: "Trade subject doesn't match" } }, 400);
    }
  }

  // We have a (authorId, subjectId) unique index; replace any prior review
  // with the same pair but keep a tradeId if newly provided.
  const review = await prisma.review.upsert({
    where: { authorId_subjectId: { authorId: user.id, subjectId: userId } },
    create: { authorId: user.id, subjectId: userId, rating, body, tradeId },
    update: { rating, body, tradeId: tradeId ?? undefined },
  });

  // Rebuild denormalised rating counters + verified flag.
  const stats = await prisma.review.aggregate({
    where: { subjectId: userId },
    _avg: { rating: true },
    _sum: { rating: true },
    _count: { _all: true },
  });
  await prisma.user.update({
    where: { id: userId },
    data: {
      ratingSum: stats._sum.rating ?? 0,
      ratingCount: stats._count._all,
      // Stay verified once you've crossed the threshold even if average dips.
      ...((stats._count._all ?? 0) >= 3 && (stats._avg.rating ?? 0) >= 4
        ? { verifiedAt: new Date() }
        : {}),
    },
  });

  return c.json({ data: review }, 201);
});

// DELETE /api/reviews/:id - delete one of the current user's reviews
router.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) return c.json({ error: { message: "Not found" } }, 404);
  if (review.authorId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);

  await prisma.review.delete({ where: { id } });
  return c.body(null, 204);
});

export { router as reviewsRouter };
