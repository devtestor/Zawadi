// Custom auth client that bypasses better-auth package (Metro .mjs resolution issue)
import * as SecureStore from "expo-secure-store";
import { fetch, type FetchRequestInit } from "expo/fetch";

const COOKIE_KEY = "vibecode_auth_cookie";
const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL!;

// Store cookies from response headers
async function persistCookies(response: { headers: { get(name: string): string | null } }) {
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    const existing = (await SecureStore.getItemAsync(COOKIE_KEY)) || "";
    // Parse individual cookie names/values
    const newCookies = setCookie
      .split(",")
      .map((c) => c.split(";")[0].trim())
      .filter(Boolean);
    const existingMap: Record<string, string> = {};
    if (existing) {
      existing.split("; ").forEach((c) => {
        const [k, v] = c.split("=");
        if (k) existingMap[k.trim()] = v || "";
      });
    }
    newCookies.forEach((cookie) => {
      const [k, v] = cookie.split("=");
      if (k) existingMap[k.trim()] = v || "";
    });
    const merged = Object.entries(existingMap)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    await SecureStore.setItemAsync(COOKIE_KEY, merged);
  }
}

async function getCookieHeader(): Promise<string> {
  return (await SecureStore.getItemAsync(COOKIE_KEY)) || "";
}

async function authFetch(path: string, options: { method?: string; body?: string } = {}) {
  const cookie = await getCookieHeader();
  const init: FetchRequestInit = {
    method: options.method,
    body: options.body,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  };
  const response = await fetch(`${baseUrl}${path}`, init);
  await persistCookies(response);
  return response;
}

// Auth client API that matches better-auth interface
export const authClient = {
  // Get current session
  getSession: async () => {
    try {
      const response = await authFetch("/api/auth/get-session");
      if (!response.ok) return { data: null, error: null };
      const json = await response.json();
      return { data: json, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e.message } };
    }
  },

  // Email OTP methods
  emailOtp: {
    sendVerificationOtp: async (params: {
      email: string;
      type: "sign-in" | "email-verification";
    }) => {
      try {
        const response = await authFetch(
          "/api/auth/email-otp/send-verification-otp",
          {
            method: "POST",
            body: JSON.stringify(params),
          }
        );
        const json = await response.json().catch(() => ({}));
        if (!response.ok)
          return {
            data: null,
            error: { message: json?.message || "Failed to send OTP" },
          };
        return { data: json, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e.message } };
      }
    },
  },

  signIn: {
    emailOtp: async (params: { email: string; otp: string }) => {
      try {
        const response = await authFetch("/api/auth/sign-in/email-otp", {
          method: "POST",
          body: JSON.stringify(params),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok)
          return {
            data: null,
            error: { message: json?.message || "Invalid code" },
          };
        return { data: json, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e.message } };
      }
    },
  },

  signOut: async () => {
    try {
      await authFetch("/api/auth/sign-out", { method: "POST" });
      await SecureStore.deleteItemAsync(COOKIE_KEY);
      return { data: null, error: null };
    } catch (e: any) {
      await SecureStore.deleteItemAsync(COOKIE_KEY);
      return { data: null, error: { message: e.message } };
    }
  },
};
