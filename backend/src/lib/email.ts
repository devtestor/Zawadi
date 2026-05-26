import { env } from "../env";
import { logger } from "./logger";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: SendEmailOptions): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${body.slice(0, 200)}`);
  }
  logger.info("email sent", { to, subject });
}

export async function sendOtpEmail({ to, code }: { to: string; code: string }): Promise<void> {
  await sendEmail({
    to,
    subject: `Your ZAWADI sign-in code: ${code}`,
    text: `Your one-time code is ${code}. It expires in 5 minutes.\n\nIf you didn't request this, ignore this email.`,
    html: renderHtml(code),
  });
}

function renderHtml(code: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0A0A0F;color:#fff;padding:32px">
  <div style="max-width:420px;margin:0 auto;background:#12121A;border-radius:16px;padding:32px;border:1px solid #1E1E2A">
    <h1 style="color:#D4A843;font-size:22px;margin:0 0 16px">ZAWADI</h1>
    <p style="color:#888;font-size:14px;margin:0 0 24px">Your one-time sign-in code:</p>
    <div style="font-size:36px;font-weight:900;letter-spacing:6px;color:#fff;text-align:center;padding:24px;background:#0A0A0F;border-radius:12px">${code}</div>
    <p style="color:#666;font-size:12px;margin:24px 0 0">Expires in 5 minutes. If you didn't request this, ignore this email.</p>
  </div></body></html>`;
}
