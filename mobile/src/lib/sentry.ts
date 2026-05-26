// Lightweight Sentry shim. When you're ready, install sentry-expo (or @sentry/react-native)
// and replace the body of captureException. Call sites don't need to change.

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN || "";
const enabled = !!dsn;

export function captureException(err: unknown, extra?: Record<string, unknown>) {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error("[sentry]", { message, extra, enabled });
  // TODO: Sentry.Native.captureException(err, { extra });
}

export function captureMessage(message: string, extra?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.warn("[sentry]", { message, extra, enabled });
}
