// Public-records verification adapter. Each African mining/land registry has
// its own quirks — for now we expose a uniform interface and ship a sample
// in-memory fixture so the API surface is real. Wire concrete providers in
// here (Kenya KRA mining cadastre, Rwanda RDB, etc.) as you get access.

export interface VerificationResult {
  status: "verified" | "unknown" | "mismatch";
  source?: string;
  details?: Record<string, unknown>;
}

const SAMPLE_LICENSES = new Map<string, { holder: string; mineral: string; country: string; expiresAt: string }>(
  [
    [
      "RW-ML-00123",
      { holder: "Karisimbi Mining Ltd", mineral: "Cassiterite", country: "Rwanda", expiresAt: "2027-12-31" },
    ],
    [
      "KE-ML-04482",
      { holder: "Kibaale Gold Co.", mineral: "Gold", country: "Kenya", expiresAt: "2028-06-30" },
    ],
  ],
);

export async function verifyMiningLicense(license: string): Promise<VerificationResult> {
  if (!license) return { status: "unknown" };
  const hit = SAMPLE_LICENSES.get(license.toUpperCase().trim());
  if (!hit) return { status: "unknown" };
  return { status: "verified", source: "fixture", details: hit };
}

export async function verifyLandDeed(_country: string, _deed: string): Promise<VerificationResult> {
  // Stub — return unknown until a real provider is wired.
  return { status: "unknown" };
}
