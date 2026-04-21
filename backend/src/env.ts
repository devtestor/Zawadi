import { z } from "zod";
import { config } from "dotenv";

config();

const envSchema = z.object({
  PORT: z.string().optional().default("3000"),
  NODE_ENV: z.string().optional().default("development"),
  DATABASE_URL: z.string().default("file:./prisma/dev.db"),
  BETTER_AUTH_SECRET: z.string().min(1, "BETTER_AUTH_SECRET is required"),
  BACKEND_URL: z.string().optional().default("http://localhost:3000"),
  FLUTTERWAVE_SECRET_KEY: z.string().optional().default(""),
  FLUTTERWAVE_WEBHOOK_SECRET: z.string().optional().default(""),
  PAYSTACK_SECRET_KEY: z.string().optional().default(""),
  PAYSTACK_CURRENCY: z.string().optional().default("NGN"),
});

export const env = envSchema.parse(process.env);
console.log("✅ Environment variables validated successfully");

export type Env = z.infer<typeof envSchema>;

declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}
