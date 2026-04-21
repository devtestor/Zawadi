import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

// GET /api/listings - browse all listings with filters
router.get("/", async (c) => {
  const { category, country, minPrice, maxPrice, search, status, listingType } = c.req.query();

  const where: {
    status?: string;
    category?: string;
    country?: string;
    listingType?: string;
    OR?: Array<{ title?: { contains: string }; description?: { contains: string }; city?: { contains: string }; country?: { contains: string } }>;
    price?: { gte?: number; lte?: number };
  } = {
    status: status || "active",
  };

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
  if (minPrice || maxPrice) {
    where.price = {};
    if (minPrice) where.price.gte = parseFloat(minPrice);
    if (maxPrice) where.price.lte = parseFloat(maxPrice);
  }

  const listings = await prisma.listing.findMany({
    where,
    include: {
      images: { orderBy: { order: "asc" } },
      user: { select: { id: true, name: true, image: true, phone: true } },
      _count: { select: { favorites: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return c.json({ data: listings });
});

// GET /api/listings/featured - featured listings
router.get("/featured", async (c) => {
  const listings = await prisma.listing.findMany({
    where: { status: "active" },
    include: {
      images: { orderBy: { order: "asc" }, take: 1 },
      user: { select: { id: true, name: true, image: true } },
      _count: { select: { favorites: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return c.json({ data: listings });
});

// GET /api/listings/:id - single listing
router.get("/:id", async (c) => {
  const { id } = c.req.param();
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      images: { orderBy: { order: "asc" } },
      user: { select: { id: true, name: true, image: true, phone: true, email: true } },
      _count: { select: { favorites: true } },
    },
  });
  if (!listing) return c.json({ error: { message: "Listing not found" } }, 404);
  return c.json({ data: listing });
});

// POST /api/listings - create listing (auth required)
router.post("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const body = await c.req.json() as {
    title: string;
    description: string;
    price: string | number;
    currency?: string;
    category: string;
    listingType?: string;
    rentalPeriod?: string;
    country: string;
    city?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    area?: number;
    bedrooms?: number;
    bathrooms?: number;
    propertyType?: string;
    carMake?: string;
    carModel?: string;
    carYear?: number;
    carMileage?: number;
    carCondition?: string;
    carColor?: string;
    carFuel?: string;
    mineralType?: string;
    miningArea?: number;
    miningLicense?: string;
    miningStatus?: string;
    machineryKind?: string;
    machineryType?: string;
    machineryBrand?: string;
    machineryModel?: string;
    machineryYear?: number;
    machineryHours?: number;
    machineryCondition?: string;
    features?: unknown;
    images?: string[];
  };

  const {
    title, description, price, currency, category, listingType, rentalPeriod,
    country, city, address,
    latitude, longitude, area, bedrooms, bathrooms, propertyType,
    carMake, carModel, carYear, carMileage, carCondition, carColor, carFuel,
    mineralType, miningArea, miningLicense, miningStatus,
    machineryKind, machineryType, machineryBrand, machineryModel,
    machineryYear, machineryHours, machineryCondition,
    features, images,
  } = body;

  const listing = await prisma.listing.create({
    data: {
      title, description, price: parseFloat(String(price)), currency: currency || "USD",
      category,
      listingType: listingType || "sale",
      rentalPeriod: listingType === "rent" ? (rentalPeriod || "month") : null,
      country, city, address, latitude, longitude,
      area, bedrooms, bathrooms, propertyType,
      carMake, carModel, carYear, carMileage, carCondition, carColor, carFuel,
      mineralType, miningArea, miningLicense, miningStatus,
      machineryKind, machineryType, machineryBrand, machineryModel,
      machineryYear, machineryHours, machineryCondition,
      features: features ? JSON.stringify(features) : null,
      userId: user.id,
      images: {
        create: (images || []).map((url: string, i: number) => ({ url, order: i })),
      },
    },
    include: { images: true },
  });

  return c.json({ data: listing }, 201);
});

// PUT /api/listings/:id - update listing
router.put("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return c.json({ error: { message: "Listing not found" } }, 404);
  if (listing.userId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);

  const body = await c.req.json();
  const updated = await prisma.listing.update({
    where: { id },
    data: { ...body, updatedAt: new Date() },
    include: { images: true },
  });

  return c.json({ data: updated });
});

// DELETE /api/listings/:id
router.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return c.json({ error: { message: "Listing not found" } }, 404);
  if (listing.userId !== user.id) return c.json({ error: { message: "Forbidden" } }, 403);

  await prisma.listing.delete({ where: { id } });
  return c.body(null, 204);
});

export { router as listingsRouter };
