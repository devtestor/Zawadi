import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { contractCreateSchema, contractSignSchema } from "../lib/schemas";
import * as chain from "../lib/chain";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// GET /api/contracts/:id
router.get("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { trade: true },
  });
  if (!contract) return c.json({ error: { message: "Not found" } }, 404);
  if (contract.buyerId !== user.id && contract.sellerId !== user.id) {
    return c.json({ error: { message: "Forbidden" } }, 403);
  }
  return c.json({ data: contract });
});

// POST /api/contracts - draft a new contract attached to a trade.
router.post("/", zValidator("json", contractCreateSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { tradeId, terms } = c.req.valid("json");
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) return c.json({ error: { message: "Trade not found" } }, 404);
  if (trade.buyerId !== user.id && trade.sellerId !== user.id) {
    return c.json({ error: { message: "Forbidden" } }, 403);
  }
  if (trade.contractId) return c.json({ error: { message: "Trade already has a contract" } }, 400);
  if (trade.status !== "initiated") {
    return c.json({ error: { message: "Contracts can only be drafted before funding" } }, 400);
  }

  const contract = await prisma.contract.create({
    data: {
      terms,
      contentHash: await sha256Hex(terms),
      buyerId: trade.buyerId,
      sellerId: trade.sellerId,
      status: "draft",
    },
  });
  await prisma.trade.update({ where: { id: trade.id }, data: { contractId: contract.id } });
  return c.json({ data: contract }, 201);
});

// POST /api/contracts/:id/sign - record a signature for the calling user.
router.post("/:id/sign", zValidator("json", contractSignSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  const { chain, chainTxHash } = c.req.valid("json");
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) return c.json({ error: { message: "Not found" } }, 404);
  if (contract.buyerId !== user.id && contract.sellerId !== user.id) {
    return c.json({ error: { message: "Forbidden" } }, 403);
  }

  const now = new Date();
  const data: Record<string, unknown> = {};
  if (user.id === contract.buyerId && !contract.buyerSignedAt) data.buyerSignedAt = now;
  if (user.id === contract.sellerId && !contract.sellerSignedAt) data.sellerSignedAt = now;
  if (chain) data.chain = chain;
  if (chainTxHash) data.chainTxHash = chainTxHash;

  // Compute the resulting status given current + new signatures.
  const buyerSigned = contract.buyerSignedAt || (user.id === contract.buyerId);
  const sellerSigned = contract.sellerSignedAt || (user.id === contract.sellerId);
  const nextStatus =
    buyerSigned && sellerSigned ? "active" :
    buyerSigned ? "signed_buyer" :
    sellerSigned ? "signed_seller" :
    contract.status;
  data.status = nextStatus;

  const updated = await prisma.contract.update({ where: { id }, data });

  // Anchor on-chain (best effort).
  if (chain.isChainEnabled()) {
    const trade = await prisma.trade.findFirst({ where: { contractId: id }, select: { id: true } });
    if (trade) {
      const fn = user.id === contract.buyerId ? chain.signBuyer : chain.signSeller;
      const tradeId = trade.id;
      fn(tradeId)
        .then(async (hash) => {
          if (!hash) return;
          await prisma.contract.update({
            where: { id },
            data: user.id === contract.buyerId
              ? { buyerSignTxHash: hash }
              : { sellerSignTxHash: hash },
          });
        })
        .catch(() => {});
    }
  }

  return c.json({ data: updated });
});

export { router as contractsRouter };
