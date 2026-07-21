import { fetch, type FetchRequestInit } from "expo/fetch";
import * as SecureStore from "@/lib/secure-store";

const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL!;
const COOKIE_KEY = "zawadi_auth_cookie";

const request = async <T>(
  url: string,
  options: { method?: string; body?: string } = {}
): Promise<T> => {
  const cookie = (await SecureStore.getItemAsync(COOKIE_KEY)) || "";
  const init: FetchRequestInit = {
    method: options.method,
    body: options.body,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
  };
  const response = await fetch(`${baseUrl}${url}`, init);

  // 1. Handle 204 No Content
  if (response.status === 204) {
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return undefined as T;
  }

  // 2. JSON responses: parse and unwrap { data }
  const contentType = response.headers.get("content-type");
  const json = contentType?.includes("application/json")
    ? await response.json().catch(() => undefined)
    : undefined;

  if (!response.ok) {
    const message =
      (json && typeof json === "object" && json.error?.message) ||
      (json && typeof json === "object" && json.message) ||
      `Request failed (${response.status})`;
    throw new Error(message);
  }

  if (json && typeof json === "object" && "data" in json) return json.data as T;
  if (json !== undefined) return json as T;

  // 3. Non-JSON success (e.g. no body): return undefined
  return undefined as T;
};

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body: any) =>
    request<T>(url, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(url: string, body: any) =>
    request<T>(url, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
  patch: <T>(url: string, body: any) =>
    request<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
};
