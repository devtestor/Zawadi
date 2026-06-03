import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { kycSubmitSchema } from "../lib/schemas";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

// GET /api/kyc - current user's KYC record
router.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const kyc = await prisma.kyc.findUnique({ where: { userId: user.id } });
  return c.json({ data: kyc });
});

// POST /api/kyc - submit a KYC application (or re-submit after rejection)
router.post("/", zValidator("json", kycSubmitSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const body = c.req.valid("json");
  const existing = await prisma.kyc.findUnique({ where: { userId: user.id } });
  if (existing && existing.status === "approved") {
    return c.json({ error: { message: "KYC already approved — contact support to update." } }, 400);
  }
  if (existing && existing.status === "pending") {
    return c.json({ error: { message: "KYC review already in progress." } }, 400);
  }

  const data = {
    ...body,
    dob: new Date(body.dob),
    status: "pending" as const,
    submittedAt: new Date(),
    rejectionReason: null,
  };
  const kyc = await prisma.kyc.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  // Fire-and-forget sanctions screen. Hits are persisted; admin reviews trigger.
  (async () => {
    const { screenName, recordHitsForKyc } = await import("../lib/sanctions");
    const dob = data.dob instanceof Date ? data.dob : null;
    const result = await screenName(body.legalName ?? user.name, dob);
    if (!result.clear) {
      await recordHitsForKyc(kyc.id, result);
    }
  })().catch(() => {});

  return c.json({ data: kyc }, 201);
});

export { router as kycRouter };
