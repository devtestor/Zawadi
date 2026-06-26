// Web shim for expo-secure-store (which has no web implementation).
//
// Backs the same getItemAsync/setItemAsync/deleteItemAsync surface used across
// the app with localStorage. Metro loads this `.web.ts` file on web and
// `secure-store.ts` on native.
function getStore(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  return getStore()?.getItem(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  getStore()?.setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  getStore()?.removeItem(key);
}
