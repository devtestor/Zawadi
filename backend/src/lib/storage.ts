import { env } from "../env";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

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

function publicUploadUrl(key: string): string {
  const base = env.BACKEND_URL.replace(/\/$/, "");
  return `${base}/uploads/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function localUploadPath(key: string): string {
  const root = resolve(process.cwd(), env.LOCAL_UPLOAD_DIR);
  const filePath = resolve(root, key);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    throw new Error("Invalid upload path");
  }
  return filePath;
}

async function localPut(key: string, body: ArrayBuffer): Promise<string> {
  const filePath = localUploadPath(key);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, new Uint8Array(body));
  return publicUploadUrl(key);
}

export async function uploadFile(file: File): Promise<UploadedFile> {
  const buf = await file.arrayBuffer();
  const id = crypto.randomUUID();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = `listings/${id}.${ext}`;
  const hasS3Config = !!(env.S3_BUCKET && env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
  const isLocalBackend = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.BACKEND_URL);
  const useLocalStorage =
    env.STORAGE_PROVIDER === "local" ||
    (!hasS3Config && (env.NODE_ENV !== "production" || isLocalBackend));

  if (!useLocalStorage && !hasS3Config) {
    throw new Error("Storage not configured — set S3_BUCKET/S3_ENDPOINT/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY");
  }

  const url = useLocalStorage
    ? await localPut(key, buf)
    : await s3Put(key, buf, file.type || "application/octet-stream");

  return {
    id,
    url,
    originalFilename: file.name,
    contentType: file.type || "application/octet-stream",
    sizeBytes: buf.byteLength,
  };
}
