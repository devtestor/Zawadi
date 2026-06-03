import { env } from "../env";

// Pesapal v3 client — auth token cache + IPN id auto-register + submit order
// + transaction status. Used by both boost and wallet top-up flows.

let cachedToken: { value: string; expiresAt: number } | null = null;
let cachedIpnId: string | null = null;

async function authToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 10_000) return cachedToken.value;
  const res = await fetch(`${env.PESAPAL_BASE_URL}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      consumer_key: env.PESAPAL_CONSUMER_KEY,
      consumer_secret: env.PESAPAL_CONSUMER_SECRET,
    }),
  });
  const data = (await res.json()) as { token?: string };
  if (!res.ok || !data.token) throw new Error("Pesapal auth failed");
  cachedToken = { value: data.token, expiresAt: now + 4 * 60 * 1000 };
  return data.token;
}

async function ipnId(): Promise<string> {
  if (env.PESAPAL_IPN_ID) return env.PESAPAL_IPN_ID;
  if (cachedIpnId) return cachedIpnId;
  const token = await authToken();
  const res = await fetch(`${env.PESAPAL_BASE_URL}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url: `${env.BACKEND_URL}/api/wallet/ipn`, ipn_notification_type: "GET" }),
  });
  const data = (await res.json()) as { ipn_id?: string };
  if (!res.ok || !data.ipn_id) throw new Error("Pesapal IPN registration failed");
  cachedIpnId = data.ipn_id;
  return data.ipn_id;
}

export interface CheckoutInput {
  txRef: string;
  amount: number;
  currency: string;
  description: string;
  callbackPath: string; // e.g. "/api/wallet/return"
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string;
}

export interface CheckoutOutput {
  redirectUrl: string;
  orderTrackingId: string;
}

export async function startCheckout(input: CheckoutInput): Promise<CheckoutOutput> {
  const token = await authToken();
  const notificationId = await ipnId();
  const payload = {
    id: input.txRef,
    currency: input.currency,
    amount: input.amount,
    description: input.description.slice(0, 100),
    callback_url: `${env.BACKEND_URL}${input.callbackPath}`,
    notification_id: notificationId,
    billing_address: {
      email_address: input.email,
      first_name: input.firstName,
      last_name: input.lastName || input.firstName,
      phone_number: input.phone || "",
    },
  };
  const res = await fetch(`${env.PESAPAL_BASE_URL}/api/Transactions/SubmitOrderRequest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as {
    order_tracking_id?: string;
    redirect_url?: string;
    error?: { message?: string } | string;
  };
  if (!res.ok || !data.redirect_url || !data.order_tracking_id) {
    const message =
      (typeof data.error === "object" && data.error?.message) ||
      (typeof data.error === "string" ? data.error : null) ||
      "Pesapal submit failed";
    throw new Error(message);
  }
  return { redirectUrl: data.redirect_url, orderTrackingId: data.order_tracking_id };
}

export interface TransactionStatus {
  completed: boolean;
  failed: boolean;
  amount: number;
  currency: string;
  merchantReference: string;
  confirmationCode?: string;
}

export async function getTransactionStatus(orderTrackingId: string): Promise<TransactionStatus> {
  const token = await authToken();
  const res = await fetch(
    `${env.PESAPAL_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
    { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
  );
  const data = (await res.json()) as {
    payment_method?: string;
    amount?: number;
    currency?: string;
    merchant_reference?: string;
    status_code?: number; // 0=INVALID 1=COMPLETED 2=FAILED 3=REVERSED
    payment_status_description?: string;
    confirmation_code?: string;
  };
  const completed = data.status_code === 1 || data.payment_status_description?.toUpperCase() === "COMPLETED";
  const failed = data.status_code === 2 || data.status_code === 3;
  return {
    completed,
    failed,
    amount: Number(data.amount ?? 0),
    currency: (data.currency ?? "").toUpperCase(),
    merchantReference: data.merchant_reference ?? "",
    confirmationCode: data.confirmation_code,
  };
}

export function pesapalConfigured(): boolean {
  return !!(env.PESAPAL_CONSUMER_KEY && env.PESAPAL_CONSUMER_SECRET);
}
