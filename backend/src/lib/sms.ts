import { env } from "../env";
import { logger } from "./logger";

async function sendViaWhatsApp(to: string, body: string): Promise<boolean> {
  if (!env.WHATSAPP_PHONE_ID || !env.WHATSAPP_TOKEN) return false;
  // WhatsApp Cloud API expects phone in international format without `+`.
  const number = to.replace(/^\+/, "");
  const res = await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: number,
      type: "text",
      text: { body, preview_url: false },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn("whatsapp send non-ok", { status: res.status, body: text.slice(0, 200) });
    return false;
  }
  return true;
}

async function sendViaTwilio(to: string, body: string): Promise<boolean> {
  if (!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM)) return false;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const form = new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: body });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn("twilio send non-ok", { status: res.status, body: text.slice(0, 200) });
    return false;
  }
  return true;
}

// Tries WhatsApp first (cheaper in Africa), falls back to Twilio SMS, then
// console. The caller is OTP-flow — any successful provider is fine.
export async function sendSms(to: string, body: string): Promise<void> {
  if (await sendViaWhatsApp(to, body)) return;
  if (await sendViaTwilio(to, body)) return;
  logger.info("sms (console fallback)", { to, body });
}
