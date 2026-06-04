import { describe, expect, it } from "bun:test";
import { mintSudoToken, verifySudoToken } from "./sudo";

describe("sudo tokens", () => {
  it("verifies a freshly-minted token for the right user", async () => {
    const token = await mintSudoToken("user_abc", 60);
    expect(await verifySudoToken(token, "user_abc")).toBe(true);
  });

  it("rejects a token for the wrong user", async () => {
    const token = await mintSudoToken("user_abc", 60);
    expect(await verifySudoToken(token, "user_other")).toBe(false);
  });

  it("rejects a token after it expires", async () => {
    // 1-second TTL; sleep ~1.2s then verify.
    const token = await mintSudoToken("user_abc", 1);
    await new Promise((r) => setTimeout(r, 1200));
    expect(await verifySudoToken(token, "user_abc")).toBe(false);
  });

  it("rejects a tampered token", async () => {
    const token = await mintSudoToken("user_abc", 60);
    const [body, sig] = token.split(".");
    expect(await verifySudoToken(`${body}.AAAA${sig.slice(4)}`, "user_abc")).toBe(false);
  });

  it("rejects malformed input", async () => {
    expect(await verifySudoToken("garbage", "user_abc")).toBe(false);
    expect(await verifySudoToken("", "user_abc")).toBe(false);
  });
});
