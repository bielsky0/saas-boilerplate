import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { isMetadataImageRoute, isPublicPage } from "@/lib/public-routes";

/**
 * Route guard (spec 2.5). Next 16's `proxy` convention (formerly `middleware`).
 *
 * This is an OPTIMISTIC check: it only tests for the presence of a signed
 * session cookie so it stays fast and edge-safe (no DB or crypto). It is a UX
 * convenience, NOT the security boundary — every protected server
 * component/action independently calls `requireSession` from `src/lib/auth`,
 * which fully validates the session server-side (spec 4.2).
 */

/**
 * Routes reachable without a session. Everything else requires one.
 *
 * Public PAGES are declared in `src/lib/public-routes.ts`, because that list has
 * two other consumers (sitemap.ts, robots.ts) and they must not drift apart. The
 * `/api/*` exemptions below stay here: they are not pages, they are never
 * sitemap candidates, and each is authenticated by something other than a
 * session.
 */
function isPublicPath(pathname: string): boolean {
  if (isPublicPage(pathname)) return true;
  // Open Graph / icon routes (spec 9.1). The extension lives in the query, not
  // the pathname, so the matcher below does NOT skip them — and an OG scraper
  // has no session and does not follow redirects. See public-routes.ts.
  if (isMetadataImageRoute(pathname)) return true;
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
  // Invitation landing must be reachable before signing in (spec 3.3); the page
  // itself gates the Accept action behind a session.
  if (pathname.startsWith("/invitations/")) return true;
  return false;
}

/** Only same-origin relative paths are valid redirect-back targets (no open redirect). */
function safeCallbackUrl(pathname: string, search: string): string {
  const target = pathname + search;
  return target.startsWith("/") && !target.startsWith("//") ? target : "/dashboard";
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const hasSession = Boolean(getSessionCookie(request));
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", safeCallbackUrl(pathname, search));
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals, the auth API, and static files.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
