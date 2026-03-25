// ============================================================================
// Structured Logger — zero-dependency, JSON in production, pretty in dev.
// Usage:
//   import { logger } from "./logger.js";
//   const log = logger.child({ service: "evaluate" });
//   log.info({ sessionId, composite }, "MSWIM score computed");
//   log.error({ err }, "Evaluation failed");
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const COLORS: Record<string, string> = {
  debug: "\x1b[36m",  // cyan
  info:  "\x1b[32m",  // green
  warn:  "\x1b[33m",  // yellow
  error: "\x1b[31m",  // red
  reset: "\x1b[0m",
};

const isProd = process.env.NODE_ENV === "production";
const configuredLevel = (process.env.LOG_LEVEL ?? "info") as LogLevel;
const minLevel = LEVELS[configuredLevel] ?? LEVELS.info;

export interface LogContext {
  [key: string]: unknown;
}

function formatPretty(level: string, ctx: LogContext, msg: string): string {
  const ts = new Date().toISOString();
  const color = COLORS[level] ?? "";
  const reset = COLORS.reset;
  const service = ctx.service ? `[${ctx.service}]` : "";
  const reqId = ctx.reqId ? ` req=${ctx.reqId}` : "";

  // Omit service/reqId from inline ctx to avoid duplication
  const { service: _s, reqId: _r, err, ...rest } = ctx;
  const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  const errStr = err instanceof Error ? ` err="${err.message}"` : (err ? ` err=${JSON.stringify(err)}` : "");

  return `${color}${ts} ${level.toUpperCase().padEnd(5)} ${service}${reqId}${reset} ${msg}${extra}${errStr}`;
}

function formatJson(level: string, ctx: LogContext, msg: string): string {
  const entry: Record<string, unknown> = {
    ts: Date.now(),
    level,
    msg,
    ...ctx,
  };
  // Serialize Error objects
  if (ctx.err instanceof Error) {
    entry.err = {
      message: ctx.err.message,
      stack: ctx.err.stack,
      name: ctx.err.name,
    };
  }
  return JSON.stringify(entry);
}

function write(level: LogLevel, ctx: LogContext, msg: string): void {
  if (LEVELS[level] < minLevel) return;

  const line = isProd ? formatJson(level, ctx, msg) : formatPretty(level, ctx, msg);

  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export interface Logger {
  debug(ctx: LogContext | string, msg?: string): void;
  info(ctx: LogContext | string, msg?: string): void;
  warn(ctx: LogContext | string, msg?: string): void;
  error(ctx: LogContext | string, msg?: string): void;
  child(bindings: LogContext): Logger;
}

function normalizeArgs(ctxOrMsg: LogContext | string, msg?: string): [LogContext, string] {
  if (typeof ctxOrMsg === "string") return [{}, ctxOrMsg];
  return [ctxOrMsg, msg ?? ""];
}

function createLogger(bindings: LogContext = {}): Logger {
  return {
    debug(ctxOrMsg, msg?) {
      const [ctx, m] = normalizeArgs(ctxOrMsg, msg);
      write("debug", { ...bindings, ...ctx }, m);
    },
    info(ctxOrMsg, msg?) {
      const [ctx, m] = normalizeArgs(ctxOrMsg, msg);
      write("info", { ...bindings, ...ctx }, m);
    },
    warn(ctxOrMsg, msg?) {
      const [ctx, m] = normalizeArgs(ctxOrMsg, msg);
      write("warn", { ...bindings, ...ctx }, m);
    },
    error(ctxOrMsg, msg?) {
      const [ctx, m] = normalizeArgs(ctxOrMsg, msg);
      write("error", { ...bindings, ...ctx }, m);
    },
    child(extraBindings: LogContext): Logger {
      return createLogger({ ...bindings, ...extraBindings });
    },
  };
}

/** Root logger. Bind a service name via .child({ service: "..." }). */
export const logger = createLogger({ service: "ava" });
