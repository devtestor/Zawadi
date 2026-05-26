import { describe, expect, it } from "bun:test";
import {
  listingCreateSchema,
  listingUpdateSchema,
  userUpdateSchema,
  phoneStartSchema,
  phoneVerifySchema,
  reportCreateSchema,
  savedSearchSchema,
} from "./schemas";

describe("listingCreateSchema", () => {
  const base = {
    title: "3 bed villa in Nairobi",
    description: "Spacious villa with garden and pool, walking distance to schools.",
    price: 250000,
    category: "property",
    country: "Kenya",
  };

  it("accepts a minimal valid listing", () => {
    const out = listingCreateSchema.parse(base);
    expect(out.title).toBe("3 bed villa in Nairobi");
    expect(out.price).toBe(250000);
  });

  it("rejects an unknown category", () => {
    expect(() => listingCreateSchema.parse({ ...base, category: "spaceship" })).toThrow();
  });

  it("rejects a negative price", () => {
    expect(() => listingCreateSchema.parse({ ...base, price: -10 })).toThrow();
  });

  it("trims whitespace from title", () => {
    const out = listingCreateSchema.parse({ ...base, title: "  My listing  " });
    expect(out.title).toBe("My listing");
  });
});

describe("listingUpdateSchema (mass-assignment defence)", () => {
  it("ignores fields not on the whitelist (does not throw)", () => {
    const out = listingUpdateSchema.parse({
      title: "Updated",
      // these should simply be stripped from the parsed output
      userId: "someone-else",
      boosted: true,
      boostedUntil: new Date().toISOString(),
    } as Record<string, unknown>);
    expect(out.title).toBe("Updated");
    expect((out as Record<string, unknown>).userId).toBeUndefined();
    expect((out as Record<string, unknown>).boosted).toBeUndefined();
    expect((out as Record<string, unknown>).boostedUntil).toBeUndefined();
  });

  it("permits a status change to a known value only", () => {
    expect(() => listingUpdateSchema.parse({ status: "sold" })).not.toThrow();
    expect(() => listingUpdateSchema.parse({ status: "wormhole" })).toThrow();
  });
});

describe("userUpdateSchema", () => {
  it("accepts a name update", () => {
    expect(userUpdateSchema.parse({ name: "Alice" }).name).toBe("Alice");
  });
  it("rejects an invalid image url", () => {
    expect(() => userUpdateSchema.parse({ image: "not-a-url" })).toThrow();
  });
});

describe("phoneStartSchema", () => {
  it("accepts E.164", () => {
    expect(phoneStartSchema.parse({ phone: "+254712345678" }).phone).toBe("+254712345678");
  });
  it("rejects garbage", () => {
    expect(() => phoneStartSchema.parse({ phone: "hello" })).toThrow();
  });
});

describe("phoneVerifySchema", () => {
  it("requires 6 digits", () => {
    expect(phoneVerifySchema.parse({ code: "123456" }).code).toBe("123456");
    expect(() => phoneVerifySchema.parse({ code: "12345" })).toThrow();
    expect(() => phoneVerifySchema.parse({ code: "abcdef" })).toThrow();
  });
});

describe("reportCreateSchema", () => {
  it("requires either listingId or subjectId", () => {
    expect(() => reportCreateSchema.parse({ reason: "spam" })).toThrow();
    expect(() => reportCreateSchema.parse({ reason: "spam", listingId: "abc" })).not.toThrow();
  });
});

describe("savedSearchSchema", () => {
  it("accepts a fully populated search", () => {
    const out = savedSearchSchema.parse({
      name: "Plots near Kampala",
      category: "land",
      country: "Uganda",
      minPrice: 1000,
      maxPrice: 50000,
    });
    expect(out.name).toBe("Plots near Kampala");
  });
});
