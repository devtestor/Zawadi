import { prisma } from "../prisma";
import { logger } from "./logger";
import { sendPushToUser } from "./push";
import { sendEmail } from "./email";
import { env } from "../env";

// Runs every 10 minutes. For each saved search, finds listings created since
// lastNotifiedAt that match the filters, and pushes a single summary
// notification per saved search per cycle.

const INTERVAL_MS = 10 * 60 * 1000;

export async function runSavedSearchScan(): Promise<void> {
  return scanOnce();
}

export async function runDailyDigest(): Promise<void> {
  return dailyDigest();
}

async function scanOnce(): Promise<void> {
  const searches = await prisma.savedSearch.findMany();
  const now = new Date();
  for (const s of searches) {
    const since = s.lastNotifiedAt ?? new Date(now.getTime() - INTERVAL_MS);
    const where: Record<string, unknown> = {
      status: "active",
      deletedAt: null,
      createdAt: { gt: since },
      userId: { not: s.userId },
    };
    if (s.category) where.category = s.category;
    if (s.country) where.country = s.country;
    if (s.listingType) where.listingType = s.listingType;
    if (s.minPrice !== null || s.maxPrice !== null) {
      const price: { gte?: number; lte?: number } = {};
      if (s.minPrice !== null) price.gte = s.minPrice;
      if (s.maxPrice !== null) price.lte = s.maxPrice;
      where.price = price;
    }
    if (s.search) {
      (where as Record<string, unknown>).OR = [
        { title: { contains: s.search } },
        { description: { contains: s.search } },
      ];
    }

    const matches = await prisma.listing.count({ where });
    if (matches > 0) {
      await sendPushToUser(s.userId, {
        title: `${matches} new match${matches === 1 ? "" : "es"} for "${s.name}"`,
        body: "Tap to browse the latest listings that fit your saved search.",
        data: { type: "savedSearch", savedSearchId: s.id },
        kind: "savedSearch",
      });
      await prisma.savedSearch.update({ where: { id: s.id }, data: { lastNotifiedAt: now } });
    }
  }
}

async function dailyDigest(): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const users = await prisma.user.findMany({
    where: { notifyMarketing: true, email: { not: "" } },
    select: { id: true, email: true, name: true, savedSearches: { select: { id: true, name: true } } },
  });
  for (const u of users) {
    if (u.savedSearches.length === 0) continue;
    const counts: { name: string; count: number }[] = [];
    for (const s of u.savedSearches) {
      const c = await prisma.listingView.count({ where: { createdAt: { gt: since } } });
      counts.push({ name: s.name, count: c });
    }
    const total = counts.reduce((a, b) => a + b.count, 0);
    if (total === 0) continue;
    const list = counts.map((c) => `<li><strong>${c.name}</strong>: ${c.count} new matches</li>`).join("");
    await sendEmail({
      to: u.email,
      subject: `Your Alcurry digest — ${total} new matches today`,
      text: `Hi ${u.name}, here's what's new in your saved searches today: ${counts
        .map((c) => `${c.name} (${c.count})`)
        .join(", ")}`,
      html: `<p>Hi ${u.name},</p><p>Here's what's new in your saved searches:</p><ul>${list}</ul>`,
    }).catch(() => {});
  }
}

const DAILY_MS = 24 * 60 * 60 * 1000;

export function startSavedSearchScanner(): void {
  // First run after a small delay so the server is fully up.
  setTimeout(() => {
    scanOnce().catch((e) => logger.warn("saved-search scan failed", { err: String(e) }));
  }, 30_000);
  setInterval(() => {
    scanOnce().catch((e) => logger.warn("saved-search scan failed", { err: String(e) }));
  }, INTERVAL_MS);

  // Daily digest at server boot + every 24h. Production should swap for a real
  // cron, but this works for single-instance deployments.
  setTimeout(() => {
    dailyDigest().catch((e) => logger.warn("daily digest failed", { err: String(e) }));
    setInterval(() => {
      dailyDigest().catch((e) => logger.warn("daily digest failed", { err: String(e) }));
    }, DAILY_MS);
  }, 60_000);
}
