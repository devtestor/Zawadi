import { prisma } from "../prisma";
import { logger } from "./logger";
import { env } from "../env";

// Sanctions / PEP screening adapter. Two providers, picked by env:
//
//   SANCTIONS_PROVIDER=opensanctions   uses https://api.opensanctions.org (free key)
//   SANCTIONS_PROVIDER=csv             matches against SANCTIONS_CSV_URL (one name per line)
//
// Both flows persist any hits to SanctionsHit rows linked to the KYC record
// so admins can re-review later.

export interface ScreeningHit {
  source: string;
  score: number;
  matchedName: string;
  details?: Record<string, unknown>;
}

export interface ScreeningResult {
  hits: ScreeningHit[];
  clear: boolean;
}

function normalise(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function screenViaOpenSanctions(name: string, dob?: Date | null): Promise<ScreeningHit[]> {
  if (!env.OPENSANCTIONS_API_KEY) return [];
  try {
    const body = {
      queries: {
        q1: {
          schema: "Person",
          properties: {
            name: [name],
            ...(dob ? { birthDate: [dob.toISOString().slice(0, 10)] } : {}),
          },
        },
      },
    };
    const res = await fetch("https://api.opensanctions.org/match/default", {
      method: "POST",
      headers: {
        Authorization: `ApiKey ${env.OPENSANCTIONS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      logger.warn("opensanctions non-ok", { status: res.status });
      return [];
    }
    const data = (await res.json()) as {
      responses?: { q1?: { results?: { score: number; caption: string; datasets: string[] }[] } };
    };
    const results = data.responses?.q1?.results ?? [];
    return results
      .filter((r) => r.score >= 0.7)
      .map((r) => ({
        source: r.datasets[0] ?? "opensanctions",
        score: r.score,
        matchedName: r.caption,
      }));
  } catch (e) {
    logger.warn("opensanctions failed", { err: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

let cachedCsv: { lines: string[]; fetchedAt: number } | null = null;
async function screenViaCsv(name: string): Promise<ScreeningHit[]> {
  if (!env.SANCTIONS_CSV_URL) return [];
  try {
    const now = Date.now();
    if (!cachedCsv || now - cachedCsv.fetchedAt > 24 * 60 * 60 * 1000) {
      const res = await fetch(env.SANCTIONS_CSV_URL);
      if (!res.ok) return [];
      const text = await res.text();
      cachedCsv = {
        lines: text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
        fetchedAt: now,
      };
    }
    const target = normalise(name);
    const hits: ScreeningHit[] = [];
    for (const line of cachedCsv.lines) {
      const n = normalise(line);
      if (n === target || n.includes(target) || target.includes(n)) {
        hits.push({ source: "csv", score: n === target ? 1 : 0.8, matchedName: line });
      }
    }
    return hits;
  } catch (e) {
    logger.warn("csv sanctions failed", { err: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

export async function screenName(name: string, dob?: Date | null): Promise<ScreeningResult> {
  if (!name) return { hits: [], clear: true };
  const provider = env.SANCTIONS_PROVIDER;
  let hits: ScreeningHit[] = [];
  if (provider === "opensanctions") hits = await screenViaOpenSanctions(name, dob);
  else if (provider === "csv") hits = await screenViaCsv(name);
  return { hits, clear: hits.length === 0 };
}

// Persist results to the SanctionsHit table. We dedupe by matched name +
// source so re-runs don't duplicate rows.
export async function recordHitsForKyc(kycId: string, result: ScreeningResult): Promise<void> {
  if (result.hits.length === 0) return;
  for (const hit of result.hits) {
    await prisma.sanctionsHit
      .create({
        data: {
          kycId,
          source: hit.source,
          score: hit.score,
          matchedName: hit.matchedName,
          details: hit.details ? JSON.stringify(hit.details) : null,
        },
      })
      .catch(() => {});
  }
}
