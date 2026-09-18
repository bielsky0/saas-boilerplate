import { NextResponse, type NextRequest } from "next/server";

import { getSessionCookieValue } from "@repo/contracts";

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
 * The guard verifies the session against Nest (`GET /v1/session`, faza 2.8)
 * so a revoked or deleted session stops at the edge instead of rendering a
 * page only to bounce — but it stays an OPTIMISTIC check and NOT the security
 * boundary: every protected server component independently calls
 * `requireSession` from `src/lib/auth`, which fully validates the session
 * server-side (spec 4.2). When Nest is unreachable the guard degrades to the
 * old presence check rather than locking everyone out; the render then
 * decides (logged-out) with the API's actual answer.
 *
 * ─── Why locale routing lives HERE and not in next-intl's middleware ─────────
 *
 * Because two systems cannot both own the response. next-intl's middleware wants
 * to rewrite/redirect for locale; this file must default-deny for auth. Composed
 * by hand, there is ONE ordering, written down, that both concerns read.
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
 * Verify the session against Nest (faza 2.8 — the proxy finale).
 *
 * `GET /v1/session` with the browser's cookie forwarded: 200 = a live
 * session, 401 = anonymous (unknown, expired, or soft-deleted account — Nest
 * resolves all three to nothing). No cookie at all short-circuits to false
 * without a fetch.
 *
 * On a fetch FAILURE (API unreachable) this falls back to the old
 * presence check (`getSessionCookieValue`). Deliberately fail-OPEN: the proxy
 * is UX convenience, NOT the security boundary — every protected render
 * re-validates via `requireSession` (which degrades to logged-out when Nest
 * is down), so a wrong `true` here costs one redirect, while a wrong `false`
 * would lock every signed-in user out during an API blip. Same stance the
 * rate-limit adapter takes on a failing store.
 *
 * Called once per proxy invocation — the "cache per-request" the plan asks
 * for is structural: there is exactly one call site and one call per
 * request, so there is nothing to memoize.
 */
async function hasVerifiedSession(request: NextRequest): Promise<boolean> {
  const cookie = request.headers.get("cookie");
  if (!cookie) return false;
  try {
    const res = await fetch(`${env.API_BASE_URL.replace(/\/+$/, "")}/v1/session`, {
      headers: { cookie },
    });
    if (res.ok) return true;
    if (res.status === 401) return false;
    // Any other status is Nest being unhappy, not an answer — fall through
    // to the presence fallback below rather than treating it as anonymous.
  } catch {
    // Unreachable API — fall through, same reason.
  }
  // Presence only (contract, never the SDK — the cookie NAME is the shared
  // vocabulary with any backend). The optimistic answer for a degraded
  // backend; the authoritative check still runs in the render.
  return Boolean(getSessionCookieValue(cookie));
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
   * Rate limiting (spec 22.3). Runs before routing: the tier table
   * (`src/lib/security/rate-limit.ts`) decides what is counted, and the guard
   * below decides who sees a page. Faza 3.4 removes the edge limiter (and the
   * guard) entirely, leaving counting to the main API.
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

  // Faza 3.3: the web serves no API routes — every unknown path, including
  // anything under `/api/`, falls through to the locale + session guard below
  // and stays default-denied.
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value ?? null;
  const acceptLanguage = request.headers.get("accept-language");

  let locale: Locale;
  let bare: string;

  if (pathname.startsWith("/api/")) {
    /*
     * No API routes are served here anymore (faza 3.3) — this branch only keeps
     * such paths from gaining a locale prefix on their way to the guard below,
     * which default-denies them. They still negotiate a locale for the login
     * redirect's sake, so a stray hit lands on a login page in the right
     * language rather than a redirect loop.
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

  // Verified, not merely present (faza 2.8): the cookie existing says a
  // login happened; Nest saying 200 says the session is still live. The
  // guard stays UX-only — `requireSession` in the render is the authority.
  const hasSession = await hasVerifiedSession(request);
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
   * Faza 3.3: the web serves no data endpoints (the whole `app/api` tree is
   * gone — the main API owns `/v1/*` and `/api/*` on its own origin), so every
   * path that reaches this proxy is a page (or a 404 for one). The `/api/`
   * branch in the flow below keeps such paths default-denied rather than
   * locale-redirected.
   *
   * `.*\..*` still skips every path containing a dot (/robots.txt, /sitemap.xml,
   * /.well-known/*), which is why the four CONSTANT security headers live in
   * next.config.ts instead — see src/lib/security/csp.ts.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
