import { env } from "../env";
import { logger } from "./logger";

// Tiny ipinfo.io adapter — returns the ISO country code for a public IP.
// Cached in-process for an hour per IP. Returns null when not configured or
// for private/local IPs.

const cache = new Map<string, { country: string | null; cachedAt: number }>();
const TTL_MS = 60 * 60 * 1000;

function isPrivate(ip: string): boolean {
  if (!ip || ip === "unknown") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("127.") || ip.startsWith("169.254.")) {
    return true;
  }
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  return false;
}

export async function lookupCountry(ip: string): Promise<string | null> {
  if (isPrivate(ip)) return null;
  if (!env.IPINFO_TOKEN) return null;
  const cached = cache.get(ip);
  if (cached && Date.now() - cached.cachedAt < TTL_MS) return cached.country;
  try {
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}?token=${env.IPINFO_TOKEN}`);
    if (!res.ok) {
      cache.set(ip, { country: null, cachedAt: Date.now() });
      return null;
    }
    const data = (await res.json()) as { country?: string };
    const country = data.country ?? null;
    cache.set(ip, { country, cachedAt: Date.now() });
    return country;
  } catch (e) {
    logger.warn("ipinfo failed", { ip, err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

// Map ISO-2 codes back to the country names our Listing.country uses.
const ISO_TO_NAME: Record<string, string> = {
  KE: "Kenya",
  NG: "Nigeria",
  ZA: "South Africa",
  RW: "Rwanda",
  UG: "Uganda",
  TZ: "Tanzania",
  EG: "Egypt",
  MA: "Morocco",
  GH: "Ghana",
  ET: "Ethiopia",
  CD: "DR Congo",
  CI: "Ivory Coast",
  SN: "Senegal",
  TN: "Tunisia",
};

export function isoCountryToName(iso: string | null): string | null {
  if (!iso) return null;
  return ISO_TO_NAME[iso.toUpperCase()] ?? null;
}
