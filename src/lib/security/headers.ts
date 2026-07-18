/**
 * Constant security headers (spec 22.1).
 *
 * ─── Why this is its own module ──────────────────────────────────────────────
 *
 * It has ZERO imports, and must keep zero. `next.config.ts` imports it, and Next
 * transpiles that file with a loader that does NOT resolve the `@/*` tsconfig
 * alias — an aliased import anywhere in the reachable graph fails the build with
 * `Cannot find module './src/...'`. `./csp.ts` reads env and so cannot be
 * imported there; these four values need nothing, so they live apart and both
 * sides import them.
 *
 * ─── Why these four are not set in the proxy ─────────────────────────────────
 *
 * They are constant, and the proxy's matcher skips every path containing a dot:
 * `/robots.txt`, `/sitemap.xml`, `/.well-known/*` and all of `public/`. Set here
 * and applied via next.config's `headers()`, they reach every response. The CSP
 * cannot join them — it carries a per-request nonce. See ./csp.ts.
 */
export const STATIC_SECURITY_HEADERS = Object.freeze({
  // Stop the browser from second-guessing Content-Type (MIME sniffing), which is
  // how an uploaded "image" gets served back as an executable script.
  "X-Content-Type-Options": "nosniff",
  // Legacy companion to CSP's frame-ancestors, for browsers predating CSP Level
  // 2. DENY rather than SAMEORIGIN: nothing here is designed to be framed.
  "X-Frame-Options": "DENY",
  // Full URL same-origin, bare origin cross-origin, nothing when downgrading to
  // http. Keeps the one-time tokens this app puts in query strings (invitation,
  // unsubscribe, password reset, email verification) out of third-party referer
  // logs — those links are credentials, and a leaked referer is a leaked account.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Two years, subdomains included, preload-list eligible. Browsers ignore it
  // over plain http, so it is inert in local development rather than harmful.
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
} as const satisfies Record<string, string>);
