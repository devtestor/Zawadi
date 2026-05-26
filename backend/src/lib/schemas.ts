import { z } from "zod";

export const CATEGORIES = ["property", "land", "car", "mining", "machinery"] as const;
export const LISTING_TYPES = ["sale", "rent"] as const;
export const RENTAL_PERIODS = ["day", "week", "month", "year"] as const;
export const LISTING_STATUSES = ["active", "sold", "pending"] as const;
export const BOOST_TIERS = ["basic", "standard", "premium"] as const;

const trimmed = z.string().trim();

// Base fields shared by create + update
const listingShared = {
  title: trimmed.min(3).max(140),
  description: trimmed.min(10).max(5000),
  price: z.union([z.number().nonnegative(), z.string()]).transform((v) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (!Number.isFinite(n) || n < 0) throw new Error("Invalid price");
    return n;
  }),
  currency: trimmed.min(3).max(4).optional(),
  listingType: z.enum(LISTING_TYPES).optional(),
  rentalPeriod: z.enum(RENTAL_PERIODS).optional(),
  country: trimmed.min(2).max(80),
  city: trimmed.max(80).optional(),
  address: trimmed.max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  area: z.number().nonnegative().optional(),
  bedrooms: z.number().int().min(0).max(50).optional(),
  bathrooms: z.number().int().min(0).max(50).optional(),
  propertyType: trimmed.max(40).optional(),
  carMake: trimmed.max(60).optional(),
  carModel: trimmed.max(60).optional(),
  carYear: z.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
  carMileage: z.number().int().min(0).optional(),
  carCondition: trimmed.max(20).optional(),
  carColor: trimmed.max(30).optional(),
  carFuel: trimmed.max(20).optional(),
  mineralType: trimmed.max(40).optional(),
  miningArea: z.number().nonnegative().optional(),
  miningLicense: trimmed.max(80).optional(),
  miningStatus: trimmed.max(20).optional(),
  machineryKind: trimmed.max(20).optional(),
  machineryType: trimmed.max(40).optional(),
  machineryBrand: trimmed.max(60).optional(),
  machineryModel: trimmed.max(60).optional(),
  machineryYear: z.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
  machineryHours: z.number().int().min(0).optional(),
  machineryCondition: trimmed.max(20).optional(),
  features: z.unknown().optional(),
  images: z
    .array(
      z.union([
        z.string().url(),
        z.object({ url: z.string().url(), pHash: z.string().min(8).max(64).optional() }),
      ]),
    )
    .max(10)
    .optional(),
};

export const listingCreateSchema = z.object({
  category: z.enum(CATEGORIES),
  ...listingShared,
});

// Update is intentionally narrower: an owner cannot flip userId, boosted,
// boostedUntil, or createdAt; status is restricted to a safe set.
export const listingUpdateSchema = z.object({
  ...listingShared,
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(LISTING_STATUSES).optional(),
}).partial();

export const userUpdateSchema = z.object({
  name: trimmed.min(1).max(80).optional(),
  phone: trimmed.max(30).optional(),
  image: z.string().url().max(500).optional(),
});

export const boostStartSchema = z.object({
  tier: z.enum(BOOST_TIERS).optional(),
  phone: trimmed.max(30).optional(),
});

export const favoriteToggleSchema = z.object({}).optional();

export const REPORT_REASONS = ["spam", "scam", "offensive", "wrong_category", "other"] as const;

export const reportCreateSchema = z
  .object({
    listingId: z.string().min(1).optional(),
    subjectId: z.string().min(1).optional(),
    reason: z.enum(REPORT_REASONS),
    body: trimmed.max(1000).optional(),
  })
  .refine((v) => v.listingId || v.subjectId, {
    message: "Provide either listingId or subjectId",
  });

export const pushTokenSchema = z.object({
  token: trimmed.min(1).max(500),
  platform: z.enum(["ios", "android", "web"]),
});

export const phoneStartSchema = z.object({
  phone: trimmed.regex(/^\+?[1-9]\d{6,14}$/, "Use E.164 format e.g. +254712345678"),
});

export const phoneVerifySchema = z.object({
  code: trimmed.regex(/^\d{6}$/, "Code must be 6 digits"),
});

export const savedSearchSchema = z.object({
  name: trimmed.min(1).max(60),
  category: z.enum(CATEGORIES).optional(),
  country: trimmed.max(80).optional(),
  search: trimmed.max(120).optional(),
  minPrice: z.number().nonnegative().optional(),
  maxPrice: z.number().nonnegative().optional(),
  listingType: z.enum(LISTING_TYPES).optional(),
});

export const notificationPrefsSchema = z.object({
  notifyChat: z.boolean().optional(),
  notifyMarketing: z.boolean().optional(),
  notifySavedSearches: z.boolean().optional(),
  preferredLang: z.enum(["en", "sw", "fr", "ar"]).optional(),
});

export const businessApplySchema = z.object({
  businessName: trimmed.min(2).max(120),
  businessType: z.enum(["agency", "dealer", "developer", "other"]),
});

export const referralRedeemSchema = z.object({
  code: trimmed.min(4).max(20),
});
