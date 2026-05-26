import { prisma } from "../prisma";

interface ExpoMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  channelId?: string;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; data?: Record<string, unknown>; kind?: "chat" | "marketing" | "savedSearch" },
): Promise<void> {
  // Honor notification preferences.
  const prefs = await prisma.user.findUnique({
    where: { id: userId },
    select: { notifyChat: true, notifyMarketing: true, notifySavedSearches: true, bannedAt: true },
  });
  if (!prefs || prefs.bannedAt) return;
  if (payload.kind === "marketing" && !prefs.notifyMarketing) return;
  if (payload.kind === "savedSearch" && !prefs.notifySavedSearches) return;
  if ((!payload.kind || payload.kind === "chat") && !prefs.notifyChat) return;

  const tokens = await prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
  if (tokens.length === 0) return;

  const messages: ExpoMessage[] = tokens.map((t) => ({
    to: t.token,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    sound: "default",
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.warn("[push] Expo push API returned", res.status);
      return;
    }
    const data = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    // Clean up invalid/uninstalled tokens.
    if (Array.isArray(data.data)) {
      const dead: string[] = [];
      data.data.forEach((ticket, i) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          dead.push(messages[i].to);
        }
      });
      if (dead.length) {
        await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
      }
    }
  } catch (e) {
    console.warn("[push] send failed", e);
  }
}
