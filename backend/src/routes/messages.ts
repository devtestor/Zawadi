import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { sendPushToUser } from "../lib/push";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

const startSchema = z.object({
  recipientId: z.string().min(1),
  listingId: z.string().optional(),
  body: z.string().trim().min(1).max(2000).optional(),
});

const sendSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

const offerSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().trim().min(3).max(4),
  body: z.string().trim().max(2000).optional(),
});

const resolveOfferSchema = z.object({
  action: z.enum(["accept", "decline", "counter"]),
  amount: z.number().positive().optional(),
});

// GET /api/messages - list current user's conversations (latest first)
router.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const parts = await prisma.conversationParticipant.findMany({
    where: { userId: user.id },
    select: {
      lastReadAt: true,
      conversation: {
        include: {
          listing: { select: { id: true, title: true, images: { take: 1, orderBy: { order: "asc" } } } },
          participants: {
            include: { user: { select: { id: true, name: true, image: true } } },
          },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: "desc" } },
  });

  const data = parts.map((p) => {
    const other = p.conversation.participants.find((x) => x.userId !== user.id);
    const last = p.conversation.messages[0];
    const unread = last && last.senderId !== user.id && (!p.lastReadAt || last.createdAt > p.lastReadAt);
    return {
      id: p.conversation.id,
      listing: p.conversation.listing,
      other: other?.user ?? null,
      lastMessage: last
        ? { id: last.id, body: last.body, senderId: last.senderId, createdAt: last.createdAt }
        : null,
      lastMessageAt: p.conversation.lastMessageAt,
      unread: !!unread,
    };
  });

  return c.json({ data });
});

// POST /api/messages/start - find or create a 1:1 conversation with a recipient
router.post("/start", zValidator("json", startSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { recipientId, listingId, body } = c.req.valid("json");
  if (recipientId === user.id) {
    return c.json({ error: { message: "Cannot start a conversation with yourself" } }, 400);
  }

  const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true } });
  if (!recipient) return c.json({ error: { message: "Recipient not found" } }, 404);

  // Look for an existing conversation with exactly these two participants and same listing context.
  const existing = await prisma.conversation.findFirst({
    where: {
      listingId: listingId ?? null,
      AND: [
        { participants: { some: { userId: user.id } } },
        { participants: { some: { userId: recipientId } } },
      ],
    },
  });

  const convo = existing
    ? existing
    : await prisma.conversation.create({
        data: {
          listingId: listingId ?? null,
          participants: {
            create: [{ userId: user.id }, { userId: recipientId }],
          },
        },
      });

  if (body) {
    await prisma.$transaction([
      prisma.message.create({ data: { conversationId: convo.id, senderId: user.id, body } }),
      prisma.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date() } }),
    ]);
  }

  return c.json({ data: { id: convo.id } });
});

async function assertParticipant(conversationId: string, userId: string) {
  const part = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  return !!part;
}

// GET /api/messages/:id - list messages in a conversation
router.get("/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  if (!(await assertParticipant(id, user.id))) {
    return c.json({ error: { message: "Forbidden" } }, 403);
  }

  const convo = await prisma.conversation.findUnique({
    where: { id },
    include: {
      listing: { select: { id: true, title: true, price: true, currency: true, images: { take: 1, orderBy: { order: "asc" } } } },
      participants: {
        include: { user: { select: { id: true, name: true, image: true } } },
      },
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
  if (!convo) return c.json({ error: { message: "Not found" } }, 404);

  return c.json({
    data: {
      id: convo.id,
      listing: convo.listing,
      participants: convo.participants.map((p) => p.user),
      messages: convo.messages,
    },
  });
});

// POST /api/messages/:id - send a message in a conversation
router.post("/:id", zValidator("json", sendSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  if (!(await assertParticipant(id, user.id))) {
    return c.json({ error: { message: "Forbidden" } }, 403);
  }

  const { body } = c.req.valid("json");
  const [msg] = await prisma.$transaction([
    prisma.message.create({
      data: { conversationId: id, senderId: user.id, body },
    }),
    prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date() },
    }),
    prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
      data: { lastReadAt: new Date() },
    }),
  ]);

  // Notify other participants (fire-and-forget).
  prisma.conversationParticipant
    .findMany({ where: { conversationId: id, NOT: { userId: user.id } }, select: { userId: true } })
    .then((others) => {
      const preview = body.length > 120 ? body.slice(0, 117) + "..." : body;
      return Promise.all(
        others.map((o) =>
          sendPushToUser(o.userId, {
            title: user.name || "New message",
            body: preview,
            data: { type: "chat", conversationId: id },
          }),
        ),
      );
    })
    .catch(() => {});

  return c.json({ data: msg }, 201);
});

// POST /api/messages/:id/read - mark conversation as read for current user
router.post("/:id/read", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  if (!(await assertParticipant(id, user.id))) {
    return c.json({ error: { message: "Forbidden" } }, 403);
  }

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
    data: { lastReadAt: new Date() },
  });
  return c.json({ data: { ok: true } });
});

// POST /api/messages/:id/offer - send a structured offer in a conversation.
router.post("/:id/offer", zValidator("json", offerSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { id } = c.req.param();
  if (!(await assertParticipant(id, user.id))) {
    return c.json({ error: { message: "Forbidden" } }, 403);
  }
  const { amount, currency } = c.req.valid("json");

  const [msg] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: id,
        senderId: user.id,
        body: `Offered ${currency.toUpperCase()} ${amount.toLocaleString()}`,
        kind: "offer",
        offerAmount: amount,
        offerCurrency: currency.toUpperCase(),
        offerStatus: "pending",
      },
    }),
    prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  prisma.conversationParticipant
    .findMany({ where: { conversationId: id, NOT: { userId: user.id } }, select: { userId: true } })
    .then((others) =>
      Promise.all(
        others.map((o) =>
          sendPushToUser(o.userId, {
            title: `New offer: ${currency.toUpperCase()} ${amount.toLocaleString()}`,
            body: "Tap to accept, decline or counter.",
            data: { type: "chat", conversationId: id },
          }),
        ),
      ),
    )
    .catch(() => {});

  return c.json({ data: msg }, 201);
});

// POST /api/messages/offer/:messageId/resolve - accept / decline / counter an offer.
router.post("/offer/:messageId/resolve", zValidator("json", resolveOfferSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const { messageId } = c.req.param();
  const { action, amount } = c.req.valid("json");

  const offer = await prisma.message.findUnique({
    where: { id: messageId },
    include: { conversation: { include: { participants: true } } },
  });
  if (!offer || offer.kind !== "offer") {
    return c.json({ error: { message: "Offer not found" } }, 404);
  }
  if (offer.offerStatus !== "pending") {
    return c.json({ error: { message: "Offer already resolved" } }, 400);
  }
  const isParticipant = offer.conversation.participants.some((p) => p.userId === user.id);
  if (!isParticipant) return c.json({ error: { message: "Forbidden" } }, 403);
  if (offer.senderId === user.id) {
    return c.json({ error: { message: "You cannot resolve your own offer" } }, 400);
  }

  const newStatus = action === "accept" ? "accepted" : action === "decline" ? "declined" : "countered";
  await prisma.message.update({ where: { id: messageId }, data: { offerStatus: newStatus } });

  // For counter, post a fresh offer message from the responder.
  if (action === "counter" && amount && amount > 0) {
    await prisma.message.create({
      data: {
        conversationId: offer.conversationId,
        senderId: user.id,
        body: `Countered with ${offer.offerCurrency} ${amount.toLocaleString()}`,
        kind: "offer",
        offerAmount: amount,
        offerCurrency: offer.offerCurrency,
        offerStatus: "pending",
      },
    });
  } else {
    await prisma.message.create({
      data: {
        conversationId: offer.conversationId,
        senderId: user.id,
        body: action === "accept" ? "Offer accepted ✅" : "Offer declined",
        kind: "text",
      },
    });
  }
  await prisma.conversation.update({
    where: { id: offer.conversationId },
    data: { lastMessageAt: new Date() },
  });

  return c.json({ data: { ok: true } });
});

export { router as messagesRouter };
