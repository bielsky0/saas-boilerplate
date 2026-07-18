import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import {
  type Locale,
  LOCALE_HEADER,
  localeFromPathname,
  negotiateLocale,
  LOCALE_COOKIE,
  stripLocale,
  withLocale,
} from "@/lib/i18n/config";
import { rateLimit } from "@/lib/adapters/rate-limit";
import type { RateLimitDecision } from "@/lib/adapters/rate-limit";
import { env } from "@/lib/env/server";
import { createLogger, REQUEST_ID_HEADER, normalizeRequestId } from "@/lib/logger";
import { isMetadataImageRoute, isPublicPage } from "@/lib/public-routes";
import { buildCsp, CSP_HEADER, NONCE_HEADER } from "@/lib/security/csp";
import { rateLimitHeaders, rateLimitKey, tierFor, TIERS } from "@/lib/security/rate-limit";

/**
 * Route guard (spec 2.5) + locale routing (spec 16) + request-id minting
 * (spec 15.3) + CSP nonce (spec 22.1). Next 16's `proxy` convention (formerly
 * `middleware`).
 *
 * The guard is an OPTIMISTIC check: it only tests for the presence of a signed
 * session cookie so it stays fast and edge-safe (no DB or crypto). It is a UX
 * convenience, NOT the security boundary — every protected server
 * component/action independently calls `requireSession` from `src/lib/auth`,
 * which fully validates the session server-side (spec 4.2).
 *
 * ─── Why locale routing lives HERE and not in next-intl's middleware ─────────
 *
 * Because two systems cannot both own the response. next-intl's middleware wants
 * to rewrite/redirect for locale; this file must default-deny for auth. Composed
 * by hand, there is ONE ordering, written down, that both concerns read. Bolted
 * together, the interesting cases (a metadata image with no prefix, an /api route
 * that must not be prefixed, a login redirect that must keep one) land in
 * whichever ran first.
 *
 * It also keeps `localePrefix: "always"` honest: this file only ever REDIRECTS,
 * never rewrites, so the pathname the guard evaluated is always the pathname the
 * router serves. An `as-needed` scheme would need `rewrite("/" → "/en")`, and
 * then those two strings differ — which is precisely where an auth guard goes
 * wrong without anyone noticing.
 *
 * ─── Why the CSP does not get a branch of its own (spec 22.1) ────────────────
 *
 * Same principle, applied a second time. Spec 22.1 requires the header mechanism
 * to COMPOSE with this guard rather than compete with it, so the CSP is not a
 * decision in the flow below — it is attached by the three functions that
 * construct every response (`forward`, `redirectTo` and the terminal
 * `tooManyRequests`), exactly like the request id. The ordering above is
 * untouched, and there is no path out of this file that can forget the header,
 * because there is no path out of this file that does not go through one of
 * those three.
 *
 * ─── Rate limiting, the third concern (spec 22.3) ────────────────────────────
 *
 * `tooManyRequests` is the only one of the three that TERMINATES rather than
 * continues, and it exists as a constructor for exactly the reason above: a
 * hand-rolled `NextResponse.json` in the flow would be the first path out of this
 * file that could forget the CSP and the request id, which would make the
 * paragraph above false.
 *
 * The policy — which endpoint gets which limit — is not here either. It lives in
 * src/lib/security/rate-limit.ts, the same way the CSP string lives in csp.ts,
 * so this file stays a list of decisions rather than a table of numbers.
 *
 * The four CONSTANT security headers are not here at all; they are in
 * next.config.ts, which also covers the dot-paths this proxy's matcher skips.
 * See src/lib/security/csp.ts for why that split exists.
 */

/** Only used by RATE_LIMIT_MODE=report-only; the enforce path answers, it does not narrate. */
const log = createLogger("rate-limit");

/**
 * `/api/*` routes reachable without a session.
 *
 * Public PAGES are declared in `src/lib/public-routes.ts`, because that list has
 * two other consumers (sitemap.ts, robots.ts) and they must not drift apart.
 * These stay here: they are not pages, they are never sitemap candidates, and
 * each is authenticated by something other than a session.
 */
function isPublicApiPath(pathname: string): boolean {
  // Better Auth's HTTP surface (verification link, etc.) must stay open.
  if (pathname.startsWith("/api/auth/")) return true;
  // Test-only email inspector (guarded internally by NODE_ENV, dev/CI only).
  if (pathname.startsWith("/api/dev/")) return true;
  // Billing webhooks carry no session — the request SIGNATURE is the auth
  // (spec 5.4), verified in the route. Payment providers do not follow
  // redirects, so guarding this would look like a permanent delivery failure.
  if (pathname.startsWith("/api/billing/webhook")) return true;
  // Job drain (spec 12). Authenticated by the CRON_SECRET bearer token, not a
  // session — the caller is a scheduler, not a person. Worse than the webhook
  // case above: cron pingers DO follow redirects, so guarding this would answer
  // 307, land on /login, and report a cheerful 200 while draining nothing.
  if (pathname.startsWith("/api/cron/")) return true;
  // RFC 8058 one-click unsubscribe (spec 10.3). The HMAC in the query is the auth;
  // the sender is a mail provider's server, which has no session and reads any
  // non-2xx as a broken unsubscribe.
  if (pathname.startsWith("/api/unsubscribe")) return true;
  // MCP endpoint (spec 26). Authenticated by an OAuth 2.0 bearer token inside the
  // handler (`withMcpAuth`), not a session cookie — the caller is an AI agent, not
  // a browser. Guarding it here would 307 an API client to /login; instead the
  // handler answers 401 with the WWW-Authenticate that starts the OAuth flow.
  // (The OAuth authorization endpoints themselves live under /api/auth/, already
  // exempt above; the root /.well-known/* metadata routes bypass this proxy via
  // the matcher's `.*\..*` dot rule.)
  if (pathname.startsWith("/api/mcp")) return true;
  return false;
}

/**
 * Public pages, keyed by their BARE (locale-stripped) path.
 *
 * `/invitations/` is a page exemption that lives here rather than in
 * PUBLIC_PAGE_ROUTES only because moving it is a separate change: the landing
 * must be reachable before signing in (spec 3.3), and the page itself gates the
 * Accept action behind a session.
 */
function isPublicBarePage(bare: string): boolean {
  return isPublicPage(bare) || bare.startsWith("/invitations/");
}

/**
 * Only same-origin relative paths are valid redirect-back targets (no open
 * redirect). `pathname` arrives locale-prefixed, so the callback keeps the prefix
 * and redirect-back lands in the language the user was already reading.
 */
function safeCallbackUrl(pathname: string, search: string, locale: Locale): string {
  const target = pathname + search;
  return target.startsWith("/") && !target.startsWith("//")
    ? target
    : withLocale("/dashboard", locale);
}

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
  rateHeaders?: Record<string, string>,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  // On the CLONE, per the warning above — a fresh Headers here would strip the
  // cookie and log out every user, which is the exact bug this comment prevents.
  requestHeaders.set(NONCE_HEADER, nonce);
  if (locale) requestHeaders.set(LOCALE_HEADER, locale);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  // Advertise the remaining budget on ALLOWED responses too (spec 22.3) — a
  // client that can see it coming backs off; one that cannot discovers the limit
  // by being blocked. Attached here rather than in the flow, for the same reason
  // the CSP is.
  if (rateHeaders) {
    for (const [name, value] of Object.entries(rateHeaders)) response.headers.set(name, value);
  }
  return withCsp(response, nonce);
}

/** Redirect, keeping the request id so the hop stays correlatable. */
function redirectTo(url: URL, requestId: string, nonce: string): NextResponse {
  const response = NextResponse.redirect(url);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return withCsp(response, nonce);
}

/**
 * Terminal 429 (spec 22.3). The THIRD response constructor — see this file's
 * header for why it is a function here rather than an inline NextResponse.json
 * in the flow below.
 *
 * The body is `{ error }`, matching the shape every route handler in this repo
 * hand-rolls, and NOT the `{ error, issues }` shape, which means 422 field
 * validation. The string stays English and machine-stable because API clients
 * parse it; the human, translated message is `auth.errors.tooManyAttempts`,
 * rendered by the login form for the one case a person actually sees.
 */
function tooManyRequests(
  decision: RateLimitDecision,
  requestId: string,
  nonce: string,
): NextResponse {
  const response = NextResponse.json({ error: "Too many requests" }, { status: 429 });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  for (const [name, value] of Object.entries(rateLimitHeaders(decision))) {
    response.headers.set(name, value);
  }
  /*
   * ⚠️ A CACHED 429 IS SERVED TO EVERYONE. Any CDN or intermediary that stored
   * this response would hand it to clients that never hit a limit, for the life
   * of the cache entry — turning a per-client control into a site-wide outage.
   */
  response.headers.set("Cache-Control", "no-store");
  return withCsp(response, nonce);
}

/**
 * Server actions POST to a PAGE url with a `Next-Action` header, so they never
 * match an /api rule. See the defence-in-depth warning in security/rate-limit.ts:
 * this header is an internal Next convention, and the §2.1 login guarantee
 * deliberately does not depend on it.
 */
function isServerAction(request: NextRequest): boolean {
  return request.method === "POST" && request.headers.has("next-action");
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
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
   * security/rate-limit.ts import node:crypto directly. Web Crypto here is now a
   * preference rather than a constraint; there is no reason to change it.
   */
  const nonce = btoa(crypto.randomUUID());

  /*
   * ORDER IS THE DESIGN. Metadata images first, before anything can prefix them.
   *
   * Next serves a generated image at a pathname with NO extension and puts the
   * content hash in the QUERY (`/opengraph-image?a1b2c3`), so the matcher's
   * `.*\..*` skip does not apply and these DO reach this function. An OG scraper
   * has no session and does not follow redirects, so both a locale redirect and
   * an auth redirect turn every share card on every social network into a login
   * page. See `isMetadataImageRoute` in public-routes.ts.
   */
  if (isMetadataImageRoute(pathname)) {
    return forward(request, requestId, nonce);
  }

  /*
   * Rate limiting (spec 22.3). ORDER IS THE DESIGN here too, and this step sits
   * between two specific neighbours:
   *
   *   - AFTER the metadata-image escape above. An OG scraper has no session and
   *     does not retry; a social network that gets a 429 caches the failure, so
   *     one burst of shares would break every share card for as long as that
   *     cache lives.
   *   - BEFORE `isPublicApiPath`. That list is exactly the set of endpoints an
   *     anonymous attacker can reach without a session, which makes it the set
   *     most in need of counting — exempting it would invert the point.
   */
  let rateHeaders: Record<string, string> | undefined;
  if (env.RATE_LIMIT_MODE !== "off") {
    const tier = tierFor(pathname, request.method, isServerAction(request));
    if (tier !== "exempt") {
      const decision = await rateLimit.consume(rateLimitKey(tier, request), TIERS[tier]);
      if (!decision.allowed) {
        if (env.RATE_LIMIT_MODE === "enforce") {
          return tooManyRequests(decision, requestId, nonce);
        }
        // report-only: count, say so, block nothing. The tuning mode — see the
        // RATE_LIMIT_MODE comment in env/server.ts.
        log.warn("rate limit would block", { tier, pathname, method: request.method, requestId });
      }
      rateHeaders = rateLimitHeaders(decision);
    }
  }

  // Non-session-authenticated API routes: signature, bearer token or HMAC.
  if (isPublicApiPath(pathname)) {
    return forward(request, requestId, nonce, undefined, rateHeaders);
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value ?? null;
  const acceptLanguage = request.headers.get("accept-language");

  let locale: Locale;
  let bare: string;

  if (pathname.startsWith("/api/")) {
    /*
     * API routes are NOT locale-prefixed — they are not pages, and `/en/api/...`
     * would be a second URL for one endpoint. They still negotiate a locale, so a
     * route handler can answer in the caller's language.
     *
     * Note this branch does NOT short-circuit to `next()`. An unknown /api route
     * must stay default-denied; only the locale STEP is skipped, never the guard.
     */
    locale = negotiateLocale({ cookieLocale, acceptLanguage });
    bare = pathname;
  } else {
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
    locale = pathLocale;
    bare = stripLocale(pathname);
  }

  if (isPublicBarePage(bare)) {
    return forward(request, requestId, nonce, locale, rateHeaders);
  }

  const hasSession = Boolean(getSessionCookie(request));
  if (!hasSession) {
    // The login URL keeps the locale, and so does the callback — a Polish reader
    // who hits a guarded page signs in in Polish and returns to a Polish page.
    const loginUrl = new URL(withLocale("/login", locale), request.url);
    loginUrl.searchParams.set("callbackUrl", safeCallbackUrl(pathname, search, locale));
    return redirectTo(loginUrl, requestId, nonce);
  }

  return forward(request, requestId, nonce, locale, rateHeaders);
}

export const config = {
  /*
   * Run on everything except Next internals and static files.
   *
   * `api/auth` USED TO BE EXCLUDED HERE and no longer is (spec 22.3): Better
   * Auth's HTTP surface is the credential surface, so excluding it from the proxy
   * excluded it from the limiter — the one endpoint group §2.1 is actually about.
   * Nothing else changes for it: `isPublicApiPath` already returns true for
   * `/api/auth/`, so it forwards without a locale redirect and without a session
   * check, and `forward`'s header clone keeps its cookies intact. Those responses
   * now also carry the CSP and the request id, which is a gain, not a regression.
   *
   * `.*\..*` still skips every path containing a dot (/robots.txt, /sitemap.xml,
   * /.well-known/*), which is why the four CONSTANT security headers live in
   * next.config.ts instead — see src/lib/security/csp.ts.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
