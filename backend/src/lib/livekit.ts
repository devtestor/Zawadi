import { env } from "../env";

// Mint a LiveKit access token without pulling the LiveKit SDK. The grants
// here mirror what `livekit-server-sdk`'s AccessToken would produce.

const enabled = !!(env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET && env.LIVEKIT_URL);

function base64Url(input: string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Buffer.from(sig).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export interface LiveKitTokenOpts {
  room: string;
  identity: string;
  ttlSeconds?: number;
}

export interface LiveKitTokenResult {
  token: string;
  url: string;
}

export async function mintLiveKitToken({ room, identity, ttlSeconds }: LiveKitTokenOpts): Promise<LiveKitTokenResult | null> {
  if (!enabled) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: env.LIVEKIT_API_KEY,
    sub: identity,
    nbf: now,
    exp: now + (ttlSeconds ?? 60 * 60),
    name: identity,
    video: {
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };
  const h = base64Url(JSON.stringify(header));
  const p = base64Url(JSON.stringify(payload));
  const sig = await hmacSha256(env.LIVEKIT_API_SECRET, `${h}.${p}`);
  return { token: `${h}.${p}.${sig}`, url: env.LIVEKIT_URL };
}
