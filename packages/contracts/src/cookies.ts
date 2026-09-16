/**
 * Cookie contract (spec 2.5) — the cookie names every backend and every
 * frontend agrees on, WITHOUT importing any auth SDK to read them.
 *
 * Backend-agnostic by design: a NestJS (Better Auth) backend, a future
 * FastAPI backend, a Next.js proxy, or a Vue SPA all resolve the session
 * token from the same header with this one function. The day a backend mints
 * different names, THIS file is the single place that changes — not every
 * reader.
 *
 * Semantics mirror Better Auth's `getSessionCookie` exactly (secure prefix
 * first, dot-variant before dash-variant, URI-decoded values), so replacing
 * the SDK call changes no bucket and no guard outcome:
 * - `__Secure-better-auth.session_token`
 * - `better-auth.session_token`
 * - `__Secure-better-auth-session_token`
 * - `better-auth-session_token`
 *
 * Presence only — this never VERIFIES the token. Verification happens in the
 * backend's session resolver (`GET /v1/session`); the proxy's guard and the
 * rate-limit keying intentionally stay optimistic.
 */

export const SESSION_COOKIE_PREFIX = "better-auth";
export const SESSION_COOKIE_NAME = "session_token";
export const SECURE_COOKIE_PREFIX = "__Secure-";

function tryDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookieHeader(header: string): Map<string, string> {
  const jar = new Map<string, string>();
  for (const chunk of header.split(";")) {
    const eq = chunk.indexOf("=");
    if (eq === -1) continue;
    const key = chunk.slice(0, eq).trim();
    const value = chunk.slice(eq + 1).trim();
    if (key) jar.set(key, tryDecode(value));
  }
  return jar;
}

/** The session token from a `Cookie` header value, or null when absent. */
export function getSessionCookieValue(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const jar = parseCookieHeader(cookieHeader);
  const candidates = [
    `${SECURE_COOKIE_PREFIX}${SESSION_COOKIE_PREFIX}.${SESSION_COOKIE_NAME}`,
    `${SESSION_COOKIE_PREFIX}.${SESSION_COOKIE_NAME}`,
    `${SECURE_COOKIE_PREFIX}${SESSION_COOKIE_PREFIX}-${SESSION_COOKIE_NAME}`,
    `${SESSION_COOKIE_PREFIX}-${SESSION_COOKIE_NAME}`,
  ];
  for (const name of candidates) {
    const value = jar.get(name);
    if (value) return value;
  }
  return null;
}
