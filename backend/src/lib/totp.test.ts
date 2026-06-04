import { describe, expect, it } from "bun:test";
import { generateSecret, otpAuthUri, totpCode, verifyTotp } from "./totp";

describe("generateSecret", () => {
  it("returns a 32-char base32 string", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("returns distinct secrets each call", () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });
});

describe("totpCode + verifyTotp", () => {
  // RFC 6238 reference values for the secret "12345678901234567890" (ASCII)
  // base32-encoded: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
  // At t=59 the expected SHA-1 code is 287082.
  const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  it("matches the RFC 6238 reference vector at t=59", async () => {
    const code = await totpCode(SECRET, 59_000);
    expect(code).toBe("287082");
  });

  it("matches the RFC 6238 reference vector at t=1111111109", async () => {
    const code = await totpCode(SECRET, 1_111_111_109_000);
    expect(code).toBe("081804");
  });

  it("accepts the current code", async () => {
    const now = Date.now();
    const code = await totpCode(SECRET, now);
    expect(await verifyTotp(SECRET, code, now)).toBe(true);
  });

  it("accepts ±1 step skew", async () => {
    const now = 1_234_567_890_000;
    const prevWindow = await totpCode(SECRET, now - 30_000);
    const nextWindow = await totpCode(SECRET, now + 30_000);
    expect(await verifyTotp(SECRET, prevWindow, now)).toBe(true);
    expect(await verifyTotp(SECRET, nextWindow, now)).toBe(true);
  });

  it("rejects a far-future / far-past code", async () => {
    const now = 1_234_567_890_000;
    const ancient = await totpCode(SECRET, now - 5 * 60 * 1000);
    expect(await verifyTotp(SECRET, ancient, now)).toBe(false);
  });

  it("rejects garbage", async () => {
    const now = Date.now();
    expect(await verifyTotp(SECRET, "000000", now)).toBe(false);
    expect(await verifyTotp(SECRET, "wrong!", now)).toBe(false);
  });
});

describe("otpAuthUri", () => {
  it("encodes the issuer + label + secret", () => {
    const uri = otpAuthUri("alice@example.com", "ABCDEF234567");
    expect(uri).toBe(
      "otpauth://totp/ZAWADI:alice%40example.com?secret=ABCDEF234567&issuer=ZAWADI&algorithm=SHA1&digits=6&period=30",
    );
  });

  it("supports a custom issuer", () => {
    const uri = otpAuthUri("bob", "ABCDEF234567", "TestIssuer");
    expect(uri).toContain("/TestIssuer:bob?");
    expect(uri).toContain("&issuer=TestIssuer&");
  });
});
