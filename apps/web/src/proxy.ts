import { NextResponse, type NextRequest } from "next/server";

import {
  type Locale,
  LOCALE_HEADER,
  localeFromPathname,
  negotiateLocale,
  LOCALE_COOKIE,
  withLocale,
} from "@/lib/i18n/config";
import { env } from "@/lib/env/server";
import { REQUEST_ID_HEADER, normalizeRequestId } from "@/lib/logger";
import { isMetadataImageRoute } from "@/lib/public-routes";
import { buildCsp, CSP_HEADER, NONCE_HEADER } from "@/lib/security/csp";

/**
 * Frontend-server configuration (faza 3.4): locale routing (spec 16) +
 * request-id minting (spec 15.3) + CSP nonce (spec 22.1). Next 16's `proxy`
 * convention (formerly `middleware`).
 *
 * Deliberately NOT a backend: no session guard, no rate limiting, no fetch to
 * the API, no database. Auth resolves at data-fetch time (loading → 401/403 →
 * UI via `requireSession` in `src/lib/auth`, which reads `GET /v1/session`
 * through `@/lib/api`), and rate limiting is counted exclusively by the main
 * API (login bucket from faza 2.1). An unauthenticated visit to a protected
 * page renders a loading state; the `/v1/*` fetch answers 401/403 and the UI
 * shows "log in"/`forbidden`.
 *
 * ─── Why locale routing lives HERE and not in next-intl's middleware ─────────
 *
 * Because two systems cannot both own the response. next-intl's middleware wants
 * to rewrite/redirect for locale; this file must stay a pure redirect/forward
 * list. Composed by hand, there is ONE ordering, written down, that every
 * concern reads.
 *
 * It also keeps `localePrefix: "always"` honest: this file only ever REDIRECTS,
 * never rewrites, so the pathname evaluated is always the pathname the router
 * serves. An `as-needed` scheme would need `rewrite("/" → "/en")`, and then
 * those two strings differ — which is precisely where a guard goes wrong
 * without anyone noticing.
 *
 * ─── Why the CSP does not get a branch of its own (spec 22.1) ────────────────
 *
 * Spec 22.1 requires the header mechanism to COMPOSE with the routing rather
 * than compete with it, so the CSP is not a decision in the flow below — it is
 * attached by the two functions that construct every response (`forward` and
 * `redirectTo`), exactly like the request id. There is no path out of this
 * file that can forget the header, because there is no path out of this file
 * that does not go through one of those two.
 *
 * The four CONSTANT security headers are not here at all; they are in
 * next.config.ts, which also covers the dot-paths this proxy's matcher skips.
 * See src/lib/security/csp.ts for why that split exists.
 */

/**
 * Attach the Content-Security-Policy (spec 22.1) to a response.
 *
 * Called from BOTH constructors below, including the redirect one. A redirect has
 * no body to protect, but spec 22.1 says every response, and a 307 that carries
 * the policy is what keeps `frame-ancestors` honest on a URL an attacker chose to
 * frame precisely because it redirects.
 *
 * `CSP_MODE=off` omits the header. The four static headers from next.config.ts
 * are unaffected either way.
 */
function withCsp(response: NextResponse, nonce: string): NextResponse {
  if (env.CSP_MODE !== "off") {
    response.headers.set(CSP_HEADER, buildCsp(nonce));
  }
  return response;
}

/**
 * Continue to the route, carrying the request id inward and outward.
 *
 * ⚠️ THE CLONE ON THE FIRST LINE IS LOAD-BEARING. `NextResponse.next({ request:
 * { headers } })` does not MERGE headers — it publishes the exact set it is given
 * as `x-middleware-override-headers`, and the router then DELETES every request
 * header not on that list (see `resolve-routes.js`, "Delete headers"). So
 * passing `new Headers([[REQUEST_ID_HEADER, id]])` would strip `cookie` from
 * every request the proxy touches: every user silently logged out, by a line that
 * looks like it only added a header. Next's docs show the clone but never say why.
 *
 * The response header is not decoration either: it is how a client — including
 * the E2E suite — correlates what it saw with what the server logged.
 */
function forward(
  request: NextRequest,
  requestId: string,
  nonce: string,
  locale?: Locale,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  // On the CLONE, per the warning above — a fresh Headers here would strip the
  // cookie and log out every user, which is the exact bug this comment prevents.
  requestHeaders.set(NONCE_HEADER, nonce);
  if (locale) requestHeaders.set(LOCALE_HEADER, locale);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return withCsp(response, nonce);
}

/** Redirect, keeping the request id so the hop stays correlatable. */
function redirectTo(url: URL, requestId: string, nonce: string): NextResponse {
  const response = NextResponse.redirect(url);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return withCsp(response, nonce);
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const requestId = normalizeRequestId(request.headers.get(REQUEST_ID_HEADER));
  /*
   * A FRESH nonce per request (spec 22.1). Reusing one across requests would make
   * it guessable, which is the whole of its security value.
   *
   * `crypto.randomUUID()` is Web Crypto and CSPRNG-backed, so no manual seeding.
   * It is also runtime-agnostic, which node:crypto is not — that mattered when
   * proxies ran on the edge runtime. Next 16 defaults them to Node.js (the
   * `runtime` option is not even available in a proxy file), which is what lets
   * other server modules import node:crypto directly. Web Crypto here is now a
   * preference rather than a constraint; there is no reason to change it.
   */
  const nonce = btoa(crypto.randomUUID());

  /*
   * ORDER IS THE DESIGN. Metadata images first, before anything can prefix them.
   *
   * Next serves a generated image at a pathname with NO extension and puts the
   * content hash in the QUERY (`/opengraph-image?a1b2c3`), so the matcher's
   * `.*\..*` skip does not apply and these DO reach this function. An OG scraper
   * has no session and does not follow redirects, so a locale redirect turns
   * every share card on every social network into a login page. See
   * `isMetadataImageRoute` in public-routes.ts.
   */
  if (isMetadataImageRoute(pathname)) {
    return forward(request, requestId, nonce);
  }

  // Faza 3.3: the web serves no API routes — every path under `/api/` falls
  // through to Next's 404. Kept out of the locale redirect so a stray hit does
  // not gain a locale prefix on its way to nowhere.
  if (pathname.startsWith("/api/")) {
    return forward(request, requestId, nonce);
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value ?? null;
  const acceptLanguage = request.headers.get("accept-language");

  const pathLocale = localeFromPathname(pathname);
  if (!pathLocale) {
    /*
     * The unprefixed → prefixed redirect (§16.1). Two things it must not lose:
     *
     *   - `search`. Drop it and `?token=…`, `?callbackUrl=…`, `?status=…` all
     *     vanish on the first hop, silently breaking password reset, email
     *     verification and redirect-back.
     *   - nothing else — this is a REDIRECT, not a rewrite, deliberately.
     *
     * It doubles as the safety net that makes the <Link> migration
     * incremental: a legacy `redirect("/login")` still lands correctly.
     */
    const target = new URL(
      withLocale(pathname, negotiateLocale({ cookieLocale, acceptLanguage })) + search,
      request.url,
    );
    return redirectTo(target, requestId, nonce);
  }
  const locale: Locale = pathLocale;

  // Faza 3.4: no session guard here. Auth resolves in the render (`requireSession`
  // → `GET /v1/session` through `@/lib/api`); an anonymous visitor to a
  // protected page gets the page shell, the data fetch answers 401/403, and the
  // UI shows the logged-out/forbidden state. The proxy stays a configuration
  // file, not a backend.
  return forward(request, requestId, nonce, locale);
}

export const config = {
  /*
   * Run on everything except Next internals and static files.
   *
   * Faza 3.3: the web serves no data endpoints (the whole `app/api` tree is
   * gone — the main API owns `/v1/*` on its own origin), so every path that
   * reaches this proxy is a page (or a 404 for one).
   *
   * `.*\..*` still skips every path containing a dot (/robots.txt, /sitemap.xml,
   * /.well-known/*), which is why the four CONSTANT security headers live in
   * next.config.ts instead — see src/lib/security/csp.ts.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
