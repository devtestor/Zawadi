import { env } from "../env";
import { logger } from "./logger";

// USD-base fallback rates. Used until the API responds at least once, and
// after that as a last-resort if the live fetch fails.
const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1,
  RWF: 1300,
  KES: 130,
  UGX: 3800,
  TZS: 2500,
  NGN: 1500,
  ZAR: 18,
  GHS: 12,
  EGP: 48,
  MAD: 10,
};

let cache: { rates: Record<string, number>; fetchedAt: number } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1h

async function fetchRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(env.FX_API_URL);
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number>; result?: string };
    if (!data.rates) return null;
    return data.rates;
  } catch (e) {
    logger.warn("fx fetch failed", { err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

async function getRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) return cache.rates;
  const fresh = await fetchRates();
  if (fresh) {
    cache = { rates: fresh, fetchedAt: now };
    return fresh;
  }
  return cache?.rates ?? FALLBACK_USD_RATES;
}

export async function convertFromUSD(amountUsd: number, currency: string): Promise<number> {
  const code = currency.toUpperCase();
  const rates = await getRates();
  const rate = rates[code] ?? FALLBACK_USD_RATES[code] ?? 1;
  // Currencies without sub-units (RWF, UGX, JPY, KRW, etc.) — round to integers.
  const isInteger = ["RWF", "UGX", "TZS", "JPY", "KRW", "CLP", "VND"].includes(code);
  const converted = amountUsd * rate;
  return isInteger ? Math.round(converted) : Math.round(converted * 100) / 100;
}
