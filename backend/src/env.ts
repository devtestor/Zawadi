import { z } from "zod";
import { config } from "dotenv";

config();

const envSchema = z.object({
  PORT: z.string().optional().default("3000"),
  NODE_ENV: z.string().optional().default("development"),
  DATABASE_URL: z.string().default("file:./prisma/dev.db"),
  DATABASE_PROVIDER: z.enum(["sqlite", "postgresql", "mysql"]).default("sqlite"),
  BETTER_AUTH_SECRET: z.string().min(1, "BETTER_AUTH_SECRET is required"),
  BACKEND_URL: z.string().optional().default("http://localhost:3000"),
  // Comma-separated. Supports * as a wildcard, e.g. "https://*.zawadi.app,https://zawadi.app"
  ALLOWED_ORIGINS: z.string().optional().default(""),
  // Comma-separated app deep-link schemes accepted by Better Auth (e.g. "zawadi://")
  APP_SCHEMES: z.string().optional().default("zawadi://"),
  FLUTTERWAVE_SECRET_KEY: z.string().optional().default(""),
  FLUTTERWAVE_WEBHOOK_SECRET: z.string().optional().default(""),
  PAYSTACK_SECRET_KEY: z.string().optional().default(""),
  PAYSTACK_CURRENCY: z.string().optional().default("NGN"),
  PESAPAL_CONSUMER_KEY: z.string().optional().default(""),
  PESAPAL_CONSUMER_SECRET: z.string().optional().default(""),
  PESAPAL_BASE_URL: z.string().optional().default("https://cybqa.pesapal.com/pesapalv3"),
  PESAPAL_IPN_ID: z.string().optional().default(""),
  PESAPAL_CURRENCY: z.string().optional().default("RWF"),

  // Observability
  SENTRY_DSN: z.string().optional().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional().default("info"),

  // Email (transactional). Resend is required for production email-OTP sign-in;
  // we validate at send time so missing keys don't block the rest of the API.
  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().optional().default("ZAWADI <onboarding@resend.dev>"),

  // Storage. S3-compatible (AWS S3, Cloudflare R2, MinIO).
  STORAGE_PROVIDER: z.enum(["s3"]).optional().default("s3"),
  S3_REGION: z.string().optional().default(""),
  S3_BUCKET: z.string().optional().default(""),
  S3_ENDPOINT: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_PUBLIC_URL: z.string().optional().default(""),

  // SMS (phone verification). twilio if creds present, else logs to console.
  SMS_PROVIDER: z.enum(["twilio", "console"]).optional().default("console"),
  TWILIO_ACCOUNT_SID: z.string().optional().default(""),
  TWILIO_AUTH_TOKEN: z.string().optional().default(""),
  TWILIO_FROM: z.string().optional().default(""),

  // FX rates
  FX_API_URL: z.string().optional().default("https://open.er-api.com/v6/latest/USD"),

  // AI listing assistant + voice search (optional)
  OPENAI_API_KEY: z.string().optional().default(""),

  // Image moderation (Sightengine — optional)
  SIGHTENGINE_USER: z.string().optional().default(""),
  SIGHTENGINE_SECRET: z.string().optional().default(""),

  // WhatsApp Cloud API for OTP delivery (optional alternative to Twilio SMS)
  WHATSAPP_PHONE_ID: z.string().optional().default(""),
  WHATSAPP_TOKEN: z.string().optional().default(""),

  // LiveKit (video tour rooms)
  LIVEKIT_API_KEY: z.string().optional().default(""),
  LIVEKIT_API_SECRET: z.string().optional().default(""),
  LIVEKIT_URL: z.string().optional().default(""),

  // On-chain escrow anchoring (EVM). When disabled or unconfigured the
  // backend skips chain writes — trades still work fully off-chain.
  CHAIN_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .default(false)
    .transform((v) => v === true || v === "true"),
  CHAIN_NAME: z.string().optional().default("polygon-amoy"),
  CHAIN_ID: z.coerce.number().int().positive().optional().default(80002),
  CHAIN_RPC_URL: z.string().optional().default(""),
  CHAIN_PRIVATE_KEY: z.string().optional().default(""),
  CHAIN_ESCROW_FACTORY: z.string().optional().default(""),
  CHAIN_EXPLORER_BASE_URL: z.string().optional().default("https://amoy.polygonscan.com"),

  // Marketplace policy
  HIGH_VALUE_USD: z.coerce.number().optional().default(500_000),
  // Platform fee on each escrow release, in basis points (250 = 2.5%).
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(2000).optional().default(250),
  // KYC required when a single trade exceeds this many USD-equivalent units.
  KYC_REQUIRED_OVER_USD: z.coerce.number().optional().default(1_000),
  // Default wallet currency. Trades may use other currencies; FX layer converts.
  WALLET_DEFAULT_CURRENCY: z.string().optional().default("USD"),
  // Allowed auction-close timing slop in seconds.
  AUCTION_GRACE_SECONDS: z.coerce.number().int().min(0).optional().default(30),
  // Escrow auto-release N days after `delivered` unless disputed/confirmed.
  HOLDING_PERIOD_DAYS: z.coerce.number().int().min(0).optional().default(3),
  // Outbound webhook delivery
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).optional().default(8),
  WEBHOOK_BASE_BACKOFF_MS: z.coerce.number().int().min(1000).optional().default(30_000),

  // Sanctions / PEP screening
  SANCTIONS_PROVIDER: z.enum(["none", "opensanctions", "csv"]).optional().default("none"),
  OPENSANCTIONS_API_KEY: z.string().optional().default(""),
  SANCTIONS_CSV_URL: z.string().optional().default(""),

  // Geo-IP
  IPINFO_TOKEN: z.string().optional().default(""),

  // High-value 2FA threshold (USD-equivalent minor units)
  TWOFA_REQUIRED_OVER_USD: z.coerce.number().int().min(0).optional().default(5_000),
});

export const env = envSchema.parse(process.env);
console.log("✅ Environment variables validated successfully");

export type Env = z.infer<typeof envSchema>;

declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}
