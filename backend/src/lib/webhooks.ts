import { prisma } from "../prisma";
import { env } from "../env";
import { logger } from "./logger";

// Outbound webhook system. Subscribers register a URL + secret + comma-separated
// event names. On emit, we enqueue a WebhookDelivery for each matching subscriber.
// The processor runs every ~15s, picks up due deliveries, signs the body with
// HMAC-SHA256 (header: `Zawadi-Signature: t=...,v1=...`), and retries with
// exponential backoff up to env.WEBHOOK_MAX_ATTEMPTS.

export interface WebhookEvent {
  // Event identifier — keep canonical (resource.action) so subscribers can
  // filter cheaply.
  event:
    | "trade.created"
    | "trade.delivered"
    | "trade.completed"
    | "trade.refunded"
    | "trade.disputed"
    | "listing.created"
    | "listing.updated"
    | "wallet.deposit"
    | "wallet.withdraw";
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Enqueue a delivery for every subscriber that opted into this event.
export async function emitWebhook(event: WebhookEvent["event"], data: unknown): Promise<void> {
  try {
    const subscribers = await prisma.webhook.findMany({ where: { active: true } });
    const matched = subscribers.filter((w) =>
      w.events.split(",").map((e) => e.trim()).includes(event) || w.events.trim() === "*",
    );
    if (matched.length === 0) return;
    const payload = JSON.stringify({ event, data, deliveredAt: new Date().toISOString() });
    await prisma.webhookDelivery.createMany({
      data: matched.map((w) => ({
        webhookId: w.id,
        event,
        payload,
        status: "pending",
        nextAttemptAt: new Date(),
      })),
    });
  } catch (e) {
    logger.warn("emitWebhook failed", { err: e instanceof Error ? e.message : String(e) });
  }
}

async function deliverOne(deliveryId: string): Promise<void> {
  const d = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });
  if (!d || d.status !== "pending") return;
  if (!d.webhook.active) {
    await prisma.webhookDelivery.update({
      where: { id: d.id },
      data: { status: "failed", responseBody: "subscriber inactive" },
    });
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signed = `${timestamp}.${d.payload}`;
  const sig = await hmacHex(d.webhook.secret, signed);
  // During rotation overlap, include both signatures so subscribers can
  // accept either while they switch over.
  const sigPrev = d.webhook.secretPrev ? await hmacHex(d.webhook.secretPrev, signed) : null;
  const signature = sigPrev
    ? `t=${timestamp},v1=${sig},v1=${sigPrev}`
    : `t=${timestamp},v1=${sig}`;
  const attempts = d.attempts + 1;

  try {
    const res = await fetch(d.webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Zawadi-Event": d.event,
        "Zawadi-Signature": signature,
      },
      body: d.payload,
      // 8s socket timeout via AbortController
      signal: AbortSignal.timeout(8_000),
    });
    const body = await res.text().catch(() => "");
    if (res.ok) {
      await prisma.webhookDelivery.update({
        where: { id: d.id },
        data: {
          status: "delivered",
          attempts,
          responseCode: res.status,
          responseBody: body.slice(0, 500),
          lastAttemptAt: new Date(),
        },
      });
      return;
    }
    await rescheduleOrFail(d.id, attempts, res.status, body.slice(0, 500));
  } catch (e) {
    await rescheduleOrFail(d.id, attempts, null, e instanceof Error ? e.message : String(e));
  }
}

async function rescheduleOrFail(
  deliveryId: string,
  attempts: number,
  responseCode: number | null,
  responseBody: string,
): Promise<void> {
  const max = env.WEBHOOK_MAX_ATTEMPTS;
  if (attempts >= max) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "failed",
        attempts,
        responseCode: responseCode ?? null,
        responseBody,
        lastAttemptAt: new Date(),
      },
    });
    return;
  }
  // exp backoff with jitter
  const delay = env.WEBHOOK_BASE_BACKOFF_MS * Math.pow(2, attempts - 1);
  const jittered = delay + Math.floor(Math.random() * delay * 0.2);
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      attempts,
      responseCode: responseCode ?? null,
      responseBody,
      lastAttemptAt: new Date(),
      nextAttemptAt: new Date(Date.now() + jittered),
    },
  });
}

export function startWebhookProcessor(): void {
  const tick = async () => {
    try {
      const due = await prisma.webhookDelivery.findMany({
        where: { status: "pending", nextAttemptAt: { lte: new Date() } },
        orderBy: { createdAt: "asc" },
        take: 20,
        select: { id: true },
      });
      await Promise.all(due.map((d) => deliverOne(d.id)));
    } catch (e) {
      logger.warn("webhook processor tick failed", { err: e instanceof Error ? e.message : String(e) });
    }
  };
  setTimeout(tick, 5_000);
  setInterval(tick, 15_000);
}
