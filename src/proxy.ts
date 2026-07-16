import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Route guard (spec 2.5). Next 16's `proxy` convention (formerly `middleware`).
 *
 * This is an OPTIMISTIC check: it only tests for the presence of a signed
 * session cookie so it stays fast and edge-safe (no DB or crypto). It is a UX
 * convenience, NOT the security boundary — every protected server
 * component/action independently calls `requireSession` from `src/lib/auth`,
 * which fully validates the session server-side (spec 4.2).
 */

/** Routes reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = ["/", "/login", "/signup", "/verify-email"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Better Auth's HTTP surface (verification link, etc.) must stay open.
  if (pathname.startsWith("/api/auth/")) return true;
  // Test-only email inspector (guarded internally by NODE_ENV, dev/CI only).
  if (pathname.startsWith("/api/dev/")) return true;
  // Billing webhooks carry no session — the request SIGNATURE is the auth
  // (spec 5.4), verified in the route. Payment providers do not follow
  // redirects, so guarding this would look like a permanent delivery failure.
  if (pathname.startsWith("/api/billing/webhook")) return true;
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
