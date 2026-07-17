import { AsyncLocalStorage } from "node:async_hooks";

import { env } from "@/lib/env/server";

/**
 * Structured logging (spec 15.3).
 *
 * ONE call site, TWO renderers. `LOG_FORMAT=pretty` prints the
 * `[namespace] message key=value` line this codebase already spoke by hand;
 * `LOG_FORMAT=json` prints one object per line for a collector to index. That
 * split is the same bargain as `EMAIL_PROVIDER=log` vs `resend` — dev-readable,
 * prod-real — and because both renderers read the same call, a log line cannot
 * drift between them.
 *
 * This is deliberately NOT an adapter (§1.2). An adapter exists to keep a vendor
 * SDK out of feature code, and a logger has no vendor: structured lines go to
 * stdout and the platform collects stdout. Wrapping that in a contract would be a
 * hand-rolled interface faking an abstraction over exactly one thing.
 *
 * ─── Correlation ────────────────────────────────────────────────────────────
 *
 * `requestId` is minted in `src/proxy.ts` and never replaces the correlation keys
 * that already exist — `event.id` for a billing webhook, `job`/`dedupeKey` for a
 * queued job are domain-scoped and stay authoritative. A line gains `requestId`,
 * it never trades one away, so the fields nest into a tree: request → (event | job).
 *
 * Two ways to get context onto a line, because App Router gives us no single hook:
 *   - REQUESTS: `await requestLogger(ns)` — reads `headers()` once and binds
 *     `requestId`. Explicit; there is no per-request hook to seed an ALS from,
 *     since the proxy and the render are separate invocations.
 *   - JOBS: `runWithLogContext({ job, name, attempt }, fn)` — a real ALS, seeded
 *     in ONE place (the postgres adapter's claim loop), covering every handler.
 */

const LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LEVELS)[number];

/**
 * Structured fields appended to a line as `key=value`.
 *
 * `err` is reserved: it is rendered as a real Error (stack included) rather than
 * stringified into a field, because a stack squeezed through `String(e)` is just
 * the message and the one line you actually needed is gone.
 */
export type LogFields = Record<string, unknown> & { err?: unknown };

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** A logger with extra fields pre-bound onto every line. */
  child(fields: LogFields): Logger;
}

/** Ambient fields for work that has no request scope (a job drain). */
export type LogContext = Record<string, unknown>;

const contextStore = new AsyncLocalStorage<LogContext>();

/**
 * Run `fn` with ambient log fields. Seeded in exactly one place — the job
 * adapter's claim/execute loop — so every handler's lines carry the job id
 * without a single handler having to thread it through.
 */
export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  const parent = contextStore.getStore();
  return contextStore.run({ ...parent, ...context }, fn);
}

function enabled(level: LogLevel): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(env.LOG_LEVEL);
}

/** `key=value`, quoting only when the value would otherwise break the pairing. */
function formatValue(value: unknown): string {
  if (value instanceof Error) return JSON.stringify(value.message);
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return /[\s"=]/.test(text) ? JSON.stringify(text) : text;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }
  return { message: String(error) };
}

function emit(level: LogLevel, namespace: string, message: string, fields: LogFields): void {
  if (!enabled(level)) return;

  const { err, ...rest } = { ...contextStore.getStore(), ...fields };
  // `error`/`warn` go to stderr, everything else to stdout — the split every log
  // collector already understands.
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  if (env.LOG_FORMAT === "json") {
    sink(
      JSON.stringify({
        level,
        ns: namespace,
        msg: message,
        time: new Date().toISOString(),
        ...rest,
        ...(err === undefined ? {} : { err: serializeError(err) }),
      }),
    );
    return;
  }

  const pairs = Object.entries(rest)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");
  const line = `[${namespace}] ${message}${pairs ? ` ${pairs}` : ""}`;
  // Hand the Error object itself to console so the runtime prints its stack.
  if (err === undefined) sink(line);
  else sink(line, err);
}

/**
 * A logger for one namespace. Picks up ambient job context automatically; for a
 * request's `requestId`, use `requestLogger` instead.
 */
export function createLogger(namespace: string, bound: LogFields = {}): Logger {
  return {
    debug: (message, fields) => emit("debug", namespace, message, { ...bound, ...fields }),
    info: (message, fields) => emit("info", namespace, message, { ...bound, ...fields }),
    warn: (message, fields) => emit("warn", namespace, message, { ...bound, ...fields }),
    error: (message, fields) => emit("error", namespace, message, { ...bound, ...fields }),
    child: (fields) => createLogger(namespace, { ...bound, ...fields }),
  };
}

/**
 * The request id the proxy minted for this request, or `null` outside a request
 * scope.
 *
 * `headers()` throws when there is no request (a background job), so it is
 * wrapped — the same shape `features/admin/audit.ts` uses, and for the same
 * reason: correlation is evidence, never a control. A missing id must not be able
 * to stop the work it was only describing.
 */
export async function getRequestId(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    return (await headers()).get(REQUEST_ID_HEADER);
  } catch {
    return null;
  }
}

/** A logger bound to this request's id. One await at the top of a handler. */
export async function requestLogger(namespace: string): Promise<Logger> {
  const requestId = await getRequestId();
  return createLogger(namespace, requestId ? { requestId } : {});
}

/** Header carrying the request id, set on both the request and the response by the proxy. */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * An inbound request id is honored only if it looks like one.
 *
 * Two reasons, both real: an unvalidated value is a log-poisoning vector (a
 * newline forges a log line), and an unbounded one is the 431 the proxy docs warn
 * about. Anything else is replaced with a fresh id rather than rejected — a
 * malformed header is not worth failing a request over.
 */
const REQUEST_ID_PATTERN = /^[\w-]{1,64}$/;

export function normalizeRequestId(inbound: string | null): string {
  return inbound && REQUEST_ID_PATTERN.test(inbound) ? inbound : crypto.randomUUID();
}
