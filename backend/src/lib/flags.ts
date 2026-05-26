import { prisma } from "../prisma";

// Tiny feature-flag layer backed by the FeatureFlag table. Cached in-process
// for 60s. Swap for GrowthBook / PostHog when needed; the surface stays the
// same.

const CACHE_MS = 60_000;
let cache: { rows: { key: string; enabled: boolean; rollout: number }[]; readAt: number } | null = null;

async function load() {
  if (cache && Date.now() - cache.readAt < CACHE_MS) return cache.rows;
  const rows = await prisma.featureFlag.findMany({ select: { key: true, enabled: true, rollout: true } });
  cache = { rows, readAt: Date.now() };
  return rows;
}

// Deterministic 0..99 bucket per user.
function bucket(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return Math.abs(h) % 100;
}

export async function isEnabled(key: string, userId?: string): Promise<boolean> {
  const flag = (await load()).find((r) => r.key === key);
  if (!flag || !flag.enabled) return false;
  if (flag.rollout >= 100) return true;
  if (!userId) return false;
  return bucket(userId) < flag.rollout;
}

export async function allFlagsFor(userId?: string): Promise<Record<string, boolean>> {
  const rows = await load();
  const out: Record<string, boolean> = {};
  for (const r of rows) {
    out[r.key] = r.enabled && (r.rollout >= 100 || (!!userId && bucket(userId) < r.rollout));
  }
  return out;
}