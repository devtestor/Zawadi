import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { api } from "./api/api";

const KEY = "zawadi:offline-fav-queue:v1";
type Op = { listingId: string; queuedAt: number };

async function read(): Promise<Op[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Op[]) : [];
  } catch {
    return [];
  }
}

async function write(ops: Op[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(ops));
  } catch {
    /* best-effort */
  }
}

export async function queueFavoriteToggle(listingId: string): Promise<void> {
  const ops = await read();
  ops.push({ listingId, queuedAt: Date.now() });
  await write(ops);
}

export async function flushQueue(): Promise<{ flushed: number }> {
  const ops = await read();
  if (ops.length === 0) return { flushed: 0 };
  const remaining: Op[] = [];
  for (const op of ops) {
    try {
      await api.post(`/api/favorites/${op.listingId}`, {});
    } catch {
      remaining.push(op);
    }
  }
  await write(remaining);
  return { flushed: ops.length - remaining.length };
}

// Toggle that works offline-first: try the network, queue on failure.
export async function toggleFavorite(listingId: string): Promise<{ queued: boolean }> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) {
    await queueFavoriteToggle(listingId);
    return { queued: true };
  }
  try {
    await api.post(`/api/favorites/${listingId}`, {});
    return { queued: false };
  } catch {
    await queueFavoriteToggle(listingId);
    return { queued: true };
  }
}

let listenerInstalled = false;

export function installOfflineFavoritesSync(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      flushQueue().catch(() => {});
    }
  });
  // Flush at startup too.
  flushQueue().catch(() => {});
}
