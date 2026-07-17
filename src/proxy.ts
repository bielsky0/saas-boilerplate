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
import { REQUEST_ID_HEADER, normalizeRequestId } from "@/lib/logger";
import { isMetadataImageRoute, isPublicPage } from "@/lib/public-routes";

/**
 * Route guard (spec 2.5) + locale routing (spec 16) + request-id minting
 * (spec 15.3). Next 16's `proxy` convention (formerly `middleware`).
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
 */

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
function forward(request: NextRequest, requestId: string, locale?: Locale): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  if (locale) requestHeaders.set(LOCALE_HEADER, locale);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

/** Redirect, keeping the request id so the hop stays correlatable. */
function redirectTo(url: URL, requestId: string): NextResponse {
  const response = NextResponse.redirect(url);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const requestId = normalizeRequestId(request.headers.get(REQUEST_ID_HEADER));

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
    return forward(request, requestId);
  }

  // Non-session-authenticated API routes: signature, bearer token or HMAC.
  if (isPublicApiPath(pathname)) {
    return forward(request, requestId);
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
      return redirectTo(target, requestId);
    }
    locale = pathLocale;
    bare = stripLocale(pathname);
  }

  if (isPublicBarePage(bare)) {
    return forward(request, requestId, locale);
  }

  const hasSession = Boolean(getSessionCookie(request));
  if (!hasSession) {
    // The login URL keeps the locale, and so does the callback — a Polish reader
    // who hits a guarded page signs in in Polish and returns to a Polish page.
    const loginUrl = new URL(withLocale("/login", locale), request.url);
    loginUrl.searchParams.set("callbackUrl", safeCallbackUrl(pathname, search, locale));
    return redirectTo(loginUrl, requestId);
  }

  return forward(request, requestId, locale);
}

export const config = {
  // Run on everything except Next internals, the auth API, and static files.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
