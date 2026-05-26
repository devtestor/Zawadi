import { env } from "../env";
import { logger } from "./logger";

// Lightweight Sentry shim. Drop @sentry/node in here once you have a DSN
// and replace the body of captureException/captureMessage. The call sites
// throughout the app don't need to change.

const enabled = !!env.SENTRY_DSN;

export function captureException(err: unknown, extra?: Record<string, unknown>) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error("exception", { message, stack, extra, sentry: enabled });
  // TODO: when SENTRY_DSN is set, send to Sentry's envelope endpoint or use
  // @sentry/node's Sentry.captureException(err, { extra }).
}

export function captureMessage(message: string, extra?: Record<string, unknown>) {
  logger.warn("captured", { message, extra, sentry: enabled });
}

export function installGlobalErrorHandlers() {
  process.on("uncaughtException", (err) => captureException(err, { kind: "uncaughtException" }));
  process.on("unhandledRejection", (err) => captureException(err, { kind: "unhandledRejection" }));
}
