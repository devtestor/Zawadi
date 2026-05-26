import { env } from "../env";

export interface UploadedFile {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
}

// AWS SigV4 signing for S3-compatible PUT requests. We use this so we don't
// have to pull aws-sdk into the bundle.
async function hmac(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const keyBuf = typeof key === "string" ? enc.encode(key) : new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey("raw", keyBuf, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
}

async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function s3Put(key: string, body: ArrayBuffer, contentType: string): Promise<string> {
  const region = env.S3_REGION || "auto";
  const bucket = env.S3_BUCKET;
  const endpoint = env.S3_ENDPOINT.replace(/\/$/, "");
  const host = new URL(endpoint).host;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(body);

  const canonicalUri = `/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");

  const kDate = await hmac(`AWS4${env.S3_SECRET_ACCESS_KEY}`, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));

  const authorization = `${algorithm} Credential=${env.S3_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`${endpoint}${canonicalUri}`, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorization,
    },
    body,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`S3 PUT failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const publicBase = env.S3_PUBLIC_URL.replace(/\/$/, "") || `${endpoint}/${bucket}`;
  return `${publicBase}/${key}`;
}

export async function uploadFile(file: File): Promise<UploadedFile> {
  const buf = await file.arrayBuffer();
  if (!env.S3_BUCKET || !env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error("Storage not configured — set S3_BUCKET/S3_ENDPOINT/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY");
  }
  const id = crypto.randomUUID();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = `listings/${id}.${ext}`;
  const url = await s3Put(key, buf, file.type || "application/octet-stream");
  return {
    id,
    url,
    originalFilename: file.name,
    contentType: file.type || "application/octet-stream",
    sizeBytes: buf.byteLength,
  };
}
