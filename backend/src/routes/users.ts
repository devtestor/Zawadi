import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

// GET /api/me - get current user profile
router.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      phone: true,
      createdAt: true,
      _count: {
        select: { listings: true, favorites: true },
      },
    },
  });

  return c.json({ data: profile });
});

// PUT /api/me - update user profile
router.put("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { name, phone, image } = await c.req.json() as {
    name?: string;
    phone?: string;
    image?: string;
  };
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { name, phone, image },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      phone: true,
    },
  });

  return c.json({ data: updated });
});

// GET /api/me/my/listings - get current user's own listings
router.get("/my/listings", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const listings = await prisma.listing.findMany({
    where: { userId: user.id },
    include: {
      images: { orderBy: { order: "asc" }, take: 1 },
      _count: { select: { favorites: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ data: listings });
});

// GET /api/me/:id/listings - get public listings by user
router.get("/:id/listings", async (c) => {
  const { id } = c.req.param();
  const listings = await prisma.listing.findMany({
    where: { userId: id, status: "active" },
    include: {
      images: { orderBy: { order: "asc" }, take: 1 },
      _count: { select: { favorites: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ data: listings });
});

export { router as usersRouter };
