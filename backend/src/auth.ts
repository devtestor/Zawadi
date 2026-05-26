import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { prisma } from "./prisma";
import { env } from "./env";
import { sendOtpEmail } from "./lib/email";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: env.DATABASE_PROVIDER }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BACKEND_URL,
  trustedOrigins: [
    ...env.APP_SCHEMES.split(",").map((s) => s.trim()).filter(Boolean).map((scheme) => `${scheme.replace(/\/+$/, "")}/*/*`),
    "exp://*/*",
    "http://localhost:*",
    "http://127.0.0.1:*",
    ...env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
  ],
  plugins: [
    expo(),
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") return;
        await sendOtpEmail({ to: email, code: String(otp) });
      },
    }),
  ],
  advanced: {
    trustedProxyHeaders: true,
    // CSRF stays enabled. Expo/native + browser callers from trusted
    // origins are accepted by virtue of the trustedOrigins list above.
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      partitioned: true,
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      // OTP send is the spam vector — keep it tight.
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/sign-in/email-otp": { window: 60, max: 10 },
    },
  },
});
