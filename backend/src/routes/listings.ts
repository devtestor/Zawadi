import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { listingCreateSchema, listingUpdateSchema } from "../lib/schemas";
import { makeLimiter } from "../lib/rate-limit";
import { sendPushToUser } from "../lib/push";
import { env } from "../env";
import { convertFromUSD } from "../lib/fx";
import { fingerprintImage, moderateImage } from "../lib/moderation";
import { logger } from "../lib/logger";
import { verifyMiningLicense, verifyLandDeed } from "../lib/records";

const createLimiter = makeLimiter({ capacity: 8, windowMs: 60 * 60 * 1000 });
const businessCreateLimiter = makeLimiter({ capacity: 50, windowMs: 60 * 60 * 1000 });

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

const listQuerySchema = z.object({
  category: z.string().optional(),
  country: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  search: z.string().max(120).optional(),
  status: z.enum(["active", "sold", "pending"]).optional(),
  listingType: z.enum(["sale", "rent"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// GET /api/listings - browse all listings with filters + cursor pagination
router.get("/", zValidator("query", listQuerySchema), async (c) => {
  const user = c.get("user");
  const { category, country, minPrice, maxPrice, search, status, listingType, cursor, limit } = c.req.valid("query");

  const where: Record<string, unknown> = { status: status || "active", deletedAt: null };
  if (category) where.category = category;
  if (country) where.country = country;
  if (listingType) where.listingType = listingType;
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { city: { contains: search } },
      { country: { contains: search } },
    ];
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    const price: { gte?: number; lte?: number } = {};
    if (minPrice !== undefined) price.gte = minPrice;
    if (maxPrice !== undefined) price.lte = maxPrice;
    where.price = price;
  }

  const take = limit ?? 20;
  const listings = await prisma.listing.findMany({
    where,
    include: {
      images: { orderBy: { order: "asc" } },
      user: { select: { id: true, name: true, image: true, phone: true, verifiedAt: true, role: true, businessName: true } },
      _count: { select: { favorites: true } },
      favorites: user ? { where: { userId: user.id }, select: { id: true }, take: 1 } : false,
    },
    orderBy: [{ boosted: "desc" }, { createdAt: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = listings.length > take;
  const page = hasMore ? listings.slice(0, take) : listings;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const items = page.map((l) => ({
    ...l,
    isFavorited: Array.isArray(l.favorites) && l.favorites.length > 0,
    favorites: undefined,
  }));

  return c.json({ data: { items, nextCursor } });
});

// GET /api/listings/featured - featured listings
router.get("/featured", async (c) => {
  const user = c.get("user");
  const listings = await prisma.listing.findMany({
    where: { status: "active", deletedAt: null, boosted: true, boostedUntil: { gt: new Date() } },
    include: {
      images: { orderBy: { order: "asc" }, take: 1 },
      user: { select: { id: true, name: true, image: true, verifiedAt: true, role: true, businessName: true } },
      _count: { select: { favorites: true } },
      favorites: user ? { where: { userId: user.id }, select: { id: true }, take: 1 } : false,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const data = listings.map((l) => ({
    ...l,
    isFavorited: Array.isArray(l.favorites) && l.favorites.length > 0,
    favorites: undefined,
  }));
  return c.json({ data });
});

// GET /api/listings/:id - single listing
router.get("/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const listing = await prisma.listing.findFirst({
    where: { id, deletedAt: null },
    include: {
      images: { orderBy: { order: "asc" } },
      user: { select: { id: true, name: true, image: true, phone: true, email: true, verifiedAt: true, role: true, businessName: true } },
      _count: { select: { favorites: true } },
      favorites: user ? { where: { userId: user.id }, select: { id: true }, take: 1 } : false,
    },
  });
  if (!listing) return c.json({ error: { message: "Listing not found" } }, 404);

  // Boost A/B: if variants exist on a boosted listing, rotate the displayed title.
  let displayTitle: string = listing.title;
  let variantId: string | null = null;
  if (listing.boosted) {
    const variants = await prisma.boostVariant.findMany({
      where: { listingId: listing.id },
      orderBy: { impressions: "asc" },
    });
    if (variants.length >= 2) {
      const pick = variants[0];
      displayTitle = pick.title;
      variantId = pick.id;
      await prisma.boostVariant.update({ where: { id: pick.id }, data: { impressions: { increment: 1 } } });
    }
  }

  const data = {
    ...listing,
    title: displayTitle,
    boostVariantId: variantId,
    isFavorited: Array.isArray(listing.favorites) && listing.favorites.length > 0,
    favorites: undefined,
  };
  return c.json({ data });
});

// POST /api/listings - create listing (auth required, rate-limited per role)
router.post("/", zValidator("json", listingCreateSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  // Look up role for per-tier rate limit.
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, verifiedAt: true },
  });
  const isBusiness = dbUser?.role === "business" || dbUser?.role === "admin";
  const limiter = isBusiness ? businessCreateLimiter : createLimiter;
  const limit = limiter.take(`create:${user.id}`);
  if (!limit.ok) {
    c.header("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000)));
    return c.json(
      { error: { message: "Too many listings created — try again in a bit." } },
      429,
    );
  }

  const body = c.req.valid("json");
  const { images, features, listingType, rentalPeriod, ...rest } = body;

  // High-value listings need admin approval before going live.
  const usd = await convertFromUSD(rest.price, "USD").catch(() => rest.price);
  const isHighValue = (rest.currency || "USD").toUpperCase() === "USD" && usd >= env.HIGH_VALUE_USD;
  const underReview = isHighValue && !isBusiness;

  const listing = await prisma.listing.create({
    data: {
      ...rest,
      currency: rest.currency || "USD",
      listingType: listingType || "sale",
      rentalPeriod: (listingType || "sale") === "rent" ? (rentalPeriod || "month") : null,
      features: features !== undefined ? JSON.stringify(features) : null,
      userId: user.id,
      underReview,
      status: underReview ? "pending" : "active",
      approvedAt: underReview ? null : new Date(),
      images: {
        create: (images || []).map((entry, i) => ({
          url: typeof entry === "string" ? entry : entry.url,
          order: i,
          pHash: typeof entry === "string" ? null : entry.pHash ?? null,
        })),
      },
    },
    include: { images: true },
  });

  // Server-side fingerprint + moderation. Fire-and-forget so the client isn't
  // blocked on slow third-party calls. Client-supplied pHashes (if any) are
  // honored; otherwise we hash from the URL.
  (async () => {
    let unsafe = false;
    const collectedHashes: string[] = [];
    for (const img of listing.images) {
      const [hash, mod] = await Promise.all([
        img.pHash ? Promise.resolve(img.pHash) : fingerprintImage(img.url),
        moderateImage(img.url),
      ]);
      if ((hash && hash !== img.pHash) || !mod.safe) {
        await prisma.listingImage
          .update({
            where: { id: img.id },
            data: {
              pHash: hash ?? undefined,
              moderation: mod.safe ? undefined : JSON.stringify(mod),
            },
          })
          .catch(() => {});
      }
      if (hash) collectedHashes.push(hash);
      if (!mod.safe) {
        unsafe = true;
        logger.warn("image flagged", { listingId: listing.id, imageId: img.id, reasons: mod.reasons });
      }
    }

    // Duplicate detection across all collected hashes.
    if (collectedHashes.length) {
      const matches = await prisma.listingImage.findMany({
        where: { pHash: { in: collectedHashes }, listingId: { not: listing.id } },
        select: { listingId: true },
        take: 20,
      });
      const originalIds = Array.from(new Set(matches.map((m) => m.listingId)));
      for (const originalId of originalIds) {
        await prisma.listingDuplicate
          .upsert({
            where: { listingId_originalId: { listingId: listing.id, originalId } },
            create: { listingId: listing.id, originalId, similarity: 1 },
            update: {},
          })
          .catch(() => {});
      }
      if (originalIds.length > 0 || unsafe) {
        await prisma.listing.update({
          where: { id: listing.id },
          data: { underReview: true, status: "pending", approvedAt: null },
        });
      }
    } else if (unsafe) {
      await prisma.listing.update({
        where: { id: listing.id },
        data: { underReview: true, status: "pending", approvedAt: null },
      });
    }
  })().catch((e) => logger.warn("post-publish moderation failed", { err: String(e) }));

  return c.json({ data: listing }, 201);
});

// PUT /api/listings/:id - update listing (whitelist enforced via schema)
router.put("/:id", zValidator("json", listingUpdateSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return c.json({ error: { message: "Listing not found" } }, 404);
  if (listing.userId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);

  const body = c.req.valid("json");
  const { images, features, ...rest } = body;

  const data: Record<string, unknown> = { ...rest };
  if (features !== undefined) data.features = JSON.stringify(features);
  // rentalPeriod must agree with listingType
  if (rest.listingType === "sale") data.rentalPeriod = null;

  const updated = await prisma.$transaction(async (tx) => {
    if (images) {
      await tx.listingImage.deleteMany({ where: { listingId: id } });
      await tx.listingImage.createMany({
        data: images.map((url, i) => ({ url, order: i, listingId: id })),
      });
    }
    const u = await tx.listing.update({
      where: { id },
      data,
      include: { images: { orderBy: { order: "asc" } } },
    });
    if (typeof rest.price === "number" && rest.price !== listing.price) {
      await tx.priceHistory.create({
        data: { listingId: id, oldPrice: listing.price, newPrice: rest.price },
      });
    }
    return u;
  });

  // Price-drop alerts: if the new price is at least 10% lower, push to favoriters.
  if (
    typeof rest.price === "number" &&
    rest.price < listing.price * 0.9 &&
    updated.status === "active"
  ) {
    const favs = await prisma.favorite.findMany({
      where: { listingId: id, NOT: { userId: user.id } },
      select: { userId: true },
    });
    const drop = Math.round((1 - rest.price / listing.price) * 100);
    await Promise.all(
      favs.map((f) =>
        sendPushToUser(f.userId, {
          title: `Price drop on ${listing.title.slice(0, 40)}`,
          body: `Down ${drop}% — now ${updated.currency} ${rest.price.toLocaleString()}.`,
          data: { type: "priceDrop", listingId: id },
          kind: "savedSearch",
        }),
      ),
    );
  }

  return c.json({ data: updated });
});

// DELETE /api/listings/:id - soft delete (owner). Admin hard-deletes via /api/admin.
router.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing || listing.deletedAt) return c.json({ error: { message: "Listing not found" } }, 404);
  if (listing.userId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);

  await prisma.listing.update({ where: { id }, data: { deletedAt: new Date(), status: "pending" } });
  return c.body(null, 204);
});

// POST /api/listings/:id/view - bump view counter + log a ListingView for analytics.
router.post("/:id/view", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  try {
    await prisma.$transaction([
      prisma.listing.updateMany({
        where: { id, deletedAt: null },
        data: { viewCount: { increment: 1 } },
      }),
      prisma.listingView.create({ data: { listingId: id, userId: user?.id ?? null } }),
    ]);
  } catch {
    // best-effort
  }
  return c.json({ data: { ok: true } });
});

// GET /api/listings/:id/analytics - owner-only, last 30 days
router.get("/:id/analytics", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  const listing = await prisma.listing.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!listing) return c.json({ error: { message: "Not found" } }, 404);
  if (listing.userId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [views, favorites, messages] = await Promise.all([
    prisma.listingView.findMany({
      where: { listingId: id, createdAt: { gt: since } },
      select: { createdAt: true },
    }),
    prisma.favorite.findMany({
      where: { listingId: id, createdAt: { gt: since } },
      select: { createdAt: true },
    }),
    prisma.message.findMany({
      where: { conversation: { listingId: id }, createdAt: { gt: since } },
      select: { createdAt: true },
    }),
  ]);

  const bucket = (rows: { createdAt: Date }[]) => {
    const map = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      map.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of rows) {
      const k = r.createdAt.toISOString().slice(0, 10);
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map, ([date, count]) => ({ date, count }));
  };

  return c.json({
    data: {
      totals: { views: views.length, favorites: favorites.length, messages: messages.length },
      daily: {
        views: bucket(views),
        favorites: bucket(favorites),
        messages: bucket(messages),
      },
    },
  });
});

// GET /api/listings/:id/records — verify the listing's regulator-issued
// document (mining licence or land title) against an external registry.
router.get("/:id/records", async (c) => {
  const { id } = c.req.param();
  const l = await prisma.listing.findUnique({
    where: { id },
    select: { id: true, category: true, country: true, miningLicense: true, address: true, deletedAt: true },
  });
  if (!l || l.deletedAt) return c.json({ error: { message: "Not found" } }, 404);

  if (l.category === "mining" && l.miningLicense) {
    const result = await verifyMiningLicense(l.miningLicense);
    return c.json({ data: { kind: "mining_license", value: l.miningLicense, ...result } });
  }
  if (l.category === "land") {
    const result = await verifyLandDeed(l.country, l.address ?? "");
    return c.json({ data: { kind: "land_title", value: l.address ?? "", ...result } });
  }
  return c.json({ data: { kind: null, status: "unknown" as const } });
});

export { router as listingsRouter };
