import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env/server";

/**
 * Auth reverse proxy (spec 2 — faza 2.1). The engine's HTTP surface now lives
 * in Nest (`apps/api`, mounted allowlist-only); this route forwards the
 * browser there and relays the answer — status, `Location`, and crucially
 * every `Set-Cookie` — back untouched.
 *
 * `redirect: "manual"` is load-bearing: following redirects here would swallow
 * the intermediate response's cookies (the session the hop just minted).
 * This path must stay in the proxy public allowlist.
 */

/** Inbound headers allowed across the process boundary (allowlist, not a pipe). */
const FORWARDED_REQUEST_HEADERS = [
  "accept-language",
  "authorization",
  "content-type",
  "cookie",
  "origin",
  "referer",
  "user-agent",
  "x-app-locale",
  "x-e2e-rate-limit-bucket",
  "x-forwarded-for",
  "x-real-ip",
];

/** Response headers relayed back (plus every `Set-Cookie`, always). */
const RELAYED_RESPONSE_HEADERS = ["content-type", "location"];

/**
 * The `admin` plugin (spec 6) mounts /api/auth/admin/* — a SECOND path to
 * impersonate, ban and delete that bypasses our server actions and therefore
 * the audit log (spec 6.3). The surface stays closed here (and again in Nest's
 * allowlist), leaving `src/features/admin/actions.ts` — which writes the
 * audit row — as the only way in.
 *
 * Keep it `startsWith` and keep the trailing slash: `includes` would match
 * unrelated paths, and dropping the slash would swallow a future /api/auth/administer.
 */
function blockedAdminSurface(request: NextRequest): NextResponse | null {
  return new URL(request.url).pathname.startsWith("/api/auth/admin/")
    ? NextResponse.json({ error: "Not found" }, { status: 404 })
    : null;
}

async function proxy(request: NextRequest, method: string): Promise<NextResponse> {
  const blocked = blockedAdminSurface(request);
  if (blocked) return blocked;

  const pathname = new URL(request.url).pathname;
  const target = new URL(
    `${pathname}${request.nextUrl.search}`,
    env.API_BASE_URL.replace(/\/+$/, ""),
  );

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init: RequestInit = { method, headers, redirect: "manual" };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Buffer.from(await request.arrayBuffer());
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return NextResponse.json({ error: "Authentication service unavailable" }, { status: 502 });
  }

  const res = new NextResponse(Buffer.from(await upstream.arrayBuffer()), {
    status: upstream.status,
  });
  for (const name of RELAYED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) res.headers.set(name, value);
  }
  // Never merged: one `Set-Cookie` per header, or the browser keeps only one
  // session and the others (remember-me, admin impersonation stack) vanish.
  const setCookies =
    typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
  for (const cookie of setCookies) res.headers.append("set-cookie", cookie);
  return res;
}

export function GET(request: NextRequest): Promise<Response> {
  return proxy(request, "GET");
}

export function POST(request: NextRequest): Promise<Response> {
  return proxy(request, "POST");
}
