import { env } from "../env";
import { logger } from "./logger";

export interface ModerationResult {
  safe: boolean;
  reasons: string[];
  raw?: unknown;
}

const enabled = !!(env.SIGHTENGINE_USER && env.SIGHTENGINE_SECRET);

// Image moderation via Sightengine. When credentials aren't configured we just
// pass everything as safe — caller can still drop a manual review queue.
// Models: nudity-2.1, weapons, gore-2.0, offensive (configurable upstream).
export async function moderateImage(url: string): Promise<ModerationResult> {
  if (!enabled) return { safe: true, reasons: [] };
  try {
    const u = new URL("https://api.sightengine.com/1.0/check.json");
    u.searchParams.set("url", url);
    u.searchParams.set("models", "nudity-2.1,weapons,gore-2.0,offensive");
    u.searchParams.set("api_user", env.SIGHTENGINE_USER);
    u.searchParams.set("api_secret", env.SIGHTENGINE_SECRET);

    const res = await fetch(u);
    if (!res.ok) {
      logger.warn("sightengine non-ok", { status: res.status });
      return { safe: true, reasons: [] };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const reasons: string[] = [];
    const nudity = data.nudity as Record<string, number> | undefined;
    if (nudity && (nudity.sexual_activity ?? 0) > 0.5) reasons.push("nudity:sexual");
    if (nudity && (nudity.sexual_display ?? 0) > 0.6) reasons.push("nudity:display");
    const weapons = data.weapon as number | { classes?: Record<string, number> } | undefined;
    if (typeof weapons === "number" ? weapons > 0.5 : (weapons?.classes?.firearm ?? 0) > 0.5) reasons.push("weapon");
    const gore = data.gore as { prob?: number } | undefined;
    if ((gore?.prob ?? 0) > 0.5) reasons.push("gore");
    const offensive = data.offensive as { prob?: number } | undefined;
    if ((offensive?.prob ?? 0) > 0.5) reasons.push("offensive");
    return { safe: reasons.length === 0, reasons, raw: data };
  } catch (e) {
    logger.warn("sightengine fetch failed", { err: e instanceof Error ? e.message : String(e) });
    return { safe: true, reasons: [] };
  }
}

// 16-char fingerprint of an image. Cheap to compute, good enough to catch
// exact reposts. Swap for a real pHash (sharp/jimp) when you adopt one.
export async function fingerprintImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest).slice(0, 8))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
