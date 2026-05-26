import { env } from "../env";

type Level = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LEVELS: Record<Level, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const active = LEVELS[env.LOG_LEVEL];

// Minimal structured logger — JSON in prod, friendlier in dev. We avoid pulling
// pino as a dep so the runtime stays lean; the shape matches pino so it can be
// swapped without callers changing.
function emit(level: Level, fields: Record<string, unknown>, msg: string) {
  if (LEVELS[level] < active) return;
  const record = {
    level: LEVELS[level],
    levelName: level,
    time: new Date().toISOString(),
    msg,
    ...fields,
  };
  if (env.NODE_ENV === "development") {
    const tag = `[${level.toUpperCase()}]`;
    const ctx = Object.keys(fields).length ? " " + JSON.stringify(fields) : "";
    // eslint-disable-next-line no-console
    console.log(`${record.time} ${tag} ${msg}${ctx}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(record));
  }
}

export interface Logger {
  trace: (msg: string, fields?: Record<string, unknown>) => void;
  debug: (msg: string, fields?: Record<string, unknown>) => void;
  info: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  error: (msg: string, fields?: Record<string, unknown>) => void;
  fatal: (msg: string, fields?: Record<string, unknown>) => void;
  child: (bindings: Record<string, unknown>) => Logger;
}

function make(bindings: Record<string, unknown>): Logger {
  const log = (level: Level) => (msg: string, fields?: Record<string, unknown>) =>
    emit(level, { ...bindings, ...(fields || {}) }, msg);
  return {
    trace: log("trace"),
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    fatal: log("fatal"),
    child: (extra) => make({ ...bindings, ...extra }),
  };
}

export const logger = make({});
