import type { Request } from "express";

/**
 * Inbound headers the auth engine is allowed to see (allowlist, not a pipe).
 *
 * Lives here — not in `auth.controller.ts` — because three controllers
 * (`auth`, `organizations`, `dev`) build engine headers, and a shared helper
 * defined in one feature controller is a layering breach: importing it drags
 * the whole controller module along. `common/` is imported by everyone and
 * owned by no feature.
 */

/** Inbound headers the engine is allowed to see (allowlist, not a pipe). */
const FORWARDED_HEADERS = [
  "cookie",
  "authorization",
  "origin",
  "referer",
  "user-agent",
  "accept-language",
  "x-app-locale",
  "x-forwarded-for",
  "x-real-ip",
  "x-e2e-rate-limit-bucket",
] as const;

export function forwardedHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = req.headers[name];
    if (typeof value === "string" && value !== "") headers.set(name, value);
  }
  return headers;
}
