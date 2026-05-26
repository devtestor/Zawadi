import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth";
import { env } from "./env";
import { logger } from "./lib/logger";
import { captureException, installGlobalErrorHandlers } from "./lib/sentry";
import { listingsRouter } from "./routes/listings";
import { favoritesRouter } from "./routes/favorites";
import { usersRouter } from "./routes/users";
import { boostRouter } from "./routes/boost";
import { messagesRouter } from "./routes/messages";
import { reviewsRouter } from "./routes/reviews";
import { reportsRouter } from "./routes/reports";
import { adminRouter } from "./routes/admin";
import { pushTokensRouter } from "./routes/push-tokens";
import { savedSearchesRouter } from "./routes/saved-searches";
import { walletRouter } from "./routes/wallet";
import { kycRouter } from "./routes/kyc";
import { tradesRouter } from "./routes/trades";
import { contractsRouter } from "./routes/contracts";
import { bidsRouter } from "./routes/bids";
import { prisma } from "./prisma";
import { startSavedSearchScanner } from "./lib/saved-search-scanner";
import { startAuctionScanner } from "./lib/auction-scanner";

import type { Logger } from "./lib/logger";

const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
    log: Logger;
  };
}>();

// CORS — driven by env.ALLOWED_ORIGINS (comma-separated). Localhost is always
// allowed for dev. Native callers (Expo) include no Origin header.
const extra = env.ALLOWED_ORIGINS
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowed = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  ...extra.map((origin) => new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")}$`)),
];

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      return allowed.some((r) => r.test(origin)) ? origin : null;
    },
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  })
);

// Per-request logger with request id + timing.
app.use("*", async (c, next) => {
  const reqId =
    c.req.header("x-request-id") ||
    crypto.randomUUID();
  const log = logger.child({ reqId, method: c.req.method, path: c.req.path });
  c.set("log", log);
  c.header("x-request-id", reqId);
  const start = performance.now();
  try {
    await next();
  } finally {
    const ms = Math.round(performance.now() - start);
    log.info("request", { status: c.res.status, ms });
  }
});

// Auth middleware — also clears the session for banned users.
app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    c.set("user", null);
    c.set("session", null);
  } else {
    const fresh = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { bannedAt: true },
    });
    if (fresh?.bannedAt) {
      c.set("user", null);
      c.set("session", null);
    } else {
      c.set("user", session.user);
      c.set("session", session.session);
    }
  }
  await next();
});

// Health
app.get("/health", (c) => c.json({ status: "ok" }));

// OpenAPI spec + Scalar docs viewer
app.get("/api/openapi.json", async (c) => {
  const { openapi } = await import("./lib/openapi");
  return c.json(openapi);
});
app.get("/api/docs", (c) =>
  c.html(`<!doctype html><html><head><title>ZAWADI API</title></head>
<body><script id="api-reference" data-url="/api/openapi.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script></body></html>`),
);

// File upload (images for listings) — storage + moderation + pHash.
app.post("/api/upload", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return c.json({ error: { message: "No file provided" } }, 400);
  }
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: { message: "File too large (max 10MB)" } }, 413);
  }
  if (!file.type.startsWith("image/")) {
    return c.json({ error: { message: "Only images are accepted" } }, 415);
  }

  try {
    const [{ uploadFile }, { imagePHash }, { moderateImage }] = await Promise.all([
      import("./lib/storage"),
      import("./lib/phash"),
      import("./lib/moderation"),
    ]);
    // Compute pHash from the in-memory bytes BEFORE uploading.
    const buf = await file.arrayBuffer();
    const pHash = await imagePHash(buf).catch(() => null);
    // Re-wrap into a fresh File so uploadFile can read it.
    const reFile = new File([buf], file.name, { type: file.type });
    const uploaded = await uploadFile(reFile);
    const mod = await moderateImage(uploaded.url).catch(() => ({ safe: true, reasons: [] as string[] }));
    return c.json({ data: { ...uploaded, pHash, moderation: mod } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return c.json({ error: { message: msg } }, 500);
  }
});

// Auth routes
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// App routes
app.route("/api/listings", listingsRouter);
app.route("/api/favorites", favoritesRouter);
app.route("/api/me", usersRouter);
app.route("/api/boost", boostRouter);
app.route("/api/messages", messagesRouter);
app.route("/api/reviews", reviewsRouter);
app.route("/api/reports", reportsRouter);
app.route("/api/admin", adminRouter);
app.route("/api/push-tokens", pushTokensRouter);
app.route("/api/saved-searches", savedSearchesRouter);
app.route("/api/wallet", walletRouter);
app.route("/api/kyc", kycRouter);
app.route("/api/trades", tradesRouter);
app.route("/api/contracts", contractsRouter);
app.route("/api/bids", bidsRouter);

// Start (or rejoin) a LiveKit video room scoped to a chat conversation. Drops a
// "video-room" message into the chat so both parties can join.
app.post("/api/video/start", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);

  const body = (await c.req.json().catch(() => ({}))) as { conversationId?: string };
  if (!body.conversationId) return c.json({ error: { message: "conversationId required" } }, 400);

  const { mintLiveKitToken } = await import("./lib/livekit");
  const part = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: body.conversationId, userId: user.id } },
  });
  if (!part) return c.json({ error: { message: "Forbidden" } }, 403);

  const room = `convo-${body.conversationId}`;
  const tok = await mintLiveKitToken({ room, identity: user.id });
  if (!tok) return c.json({ error: { message: "LiveKit is not configured" } }, 503);

  const joinUrl = `${tok.url}?access_token=${tok.token}&room=${room}`;
  // Persist a video-room message so both participants see a join link.
  await prisma.message.create({
    data: {
      conversationId: body.conversationId,
      senderId: user.id,
      kind: "video-room",
      videoRoom: room,
      body: joinUrl,
    },
  });
  await prisma.conversation.update({ where: { id: body.conversationId }, data: { lastMessageAt: new Date() } });

  return c.json({ data: { joinUrl, room, token: tok.token, url: tok.url } });
});

// GET /api/chain - on-chain integration status + explorer base for the mobile UI.
app.get("/api/chain", async (c) => {
  const { isChainEnabled } = await import("./lib/chain");
  return c.json({
    data: {
      enabled: isChainEnabled(),
      name: env.CHAIN_NAME,
      chainId: env.CHAIN_ID,
      factory: env.CHAIN_ESCROW_FACTORY || null,
      explorer: env.CHAIN_EXPLORER_BASE_URL || null,
    },
  });
});

// GET /api/flags - per-user feature flag map
app.get("/api/flags", async (c) => {
  const user = c.get("user");
  const { allFlagsFor } = await import("./lib/flags");
  return c.json({ data: await allFlagsFor(user?.id) });
});

// Public-records verification (currently fixture-only).
app.get("/api/records/mining/:license", async (c) => {
  const { license } = c.req.param();
  const { verifyMiningLicense } = await import("./lib/records");
  return c.json({ data: await verifyMiningLicense(license) });
});

// Voice search — accepts an audio file, returns transcribed text via Whisper.
app.post("/api/ai/transcribe", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  if (!env.OPENAI_API_KEY) return c.json({ error: { message: "Voice search not configured" } }, 503);

  const form = await c.req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) return c.json({ error: { message: "No file" } }, 400);
  if (file.size > 5 * 1024 * 1024) return c.json({ error: { message: "Audio too large (max 5MB)" } }, 413);

  const upstream = new FormData();
  upstream.append("file", file);
  upstream.append("model", "whisper-1");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: upstream,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return c.json({ error: { message: `Whisper: ${text.slice(0, 200)}` } }, 502);
  }
  const { text } = (await res.json()) as { text: string };
  return c.json({ data: { text } });
});

// AI listing-writer (optional, gated by OPENAI_API_KEY)
app.post("/api/ai/listing-writer", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized" } }, 401);
  if (!env.OPENAI_API_KEY) {
    return c.json({ error: { message: "AI assistant is not configured. Set OPENAI_API_KEY." } }, 503);
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    category?: string;
    country?: string;
    title?: string;
    notes?: string;
  };
  const prompt = `Write a polished marketplace listing description for an African marketplace called ZAWADI.
Category: ${body.category || "(unspecified)"}
Country: ${body.country || "(unspecified)"}
Title (draft): ${body.title || "(unspecified)"}
Seller notes: ${body.notes || "(unspecified)"}

Return JSON: { "title": string (<=80 chars), "description": string (3-5 short paragraphs) }.
Be honest, concrete, and avoid hype. Use plain English. Do not invent specs the seller didn't provide.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You write clear, trustworthy marketplace listings." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return c.json({ error: { message: `OpenAI: ${text.slice(0, 200)}` } }, 502);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(content) as { title?: string; description?: string };
    return c.json({ data: parsed });
  } catch {
    return c.json({ error: { message: "Could not parse AI response" } }, 502);
  }
});

// Catch uncaught errors from any route.
app.onError((err, c) => {
  captureException(err, { path: c.req.path, method: c.req.method });
  return c.json({ error: { message: "Internal server error" } }, 500);
});

installGlobalErrorHandlers();
startSavedSearchScanner();
startAuctionScanner();

const port = parseInt(env.PORT);
logger.info("server started", { port, env: env.NODE_ENV });

export default {
  port,
  fetch: app.fetch,
};
