// Step-up auth — a privileged session window for destructive admin actions.
// We mint a short-lived signed token after the caller passes a fresh 2FA
// check; the token must be presented as `X-Sudo` for the destructive route.
//
// Tokens are JWT-shaped (HS256) and live in-memory only — no DB hit per call.
// Signing key derived from BETTER_AUTH_SECRET so a server restart invalidates
// every outstanding sudo session (good for a panic-button kill switch).

import { env } from "../env";

const TTL_SECONDS = 5 * 60;

async function hmacBase64Url(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64Url(new Uint8Array(sig));
}

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

interface Payload {
  sub: string;
  exp: number;
}

export async function mintSudoToken(userId: string, ttlSeconds = TTL_SECONDS): Promise<string> {
  const payload: Payload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacBase64Url(env.BETTER_AUTH_SECRET, body);
  return `${body}.${sig}`;
}

export async function verifySudoToken(token: string, userId: string): Promise<boolean> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expected = await hmacBase64Url(env.BETTER_AUTH_SECRET, body);
  if (expected !== sig) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as Payload;
    if (payload.sub !== userId) return false;
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}
