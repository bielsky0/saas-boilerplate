import { NextResponse, type NextRequest } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/adapters/auth";

/**
 * Better Auth catch-all endpoint (spec 2). Serves the engine's HTTP surface —
 * for this phase the email-verification link (`GET /api/auth/verify-email`) and
 * the internal endpoints the server-side API uses. Sign-up/sign-in/sign-out are
 * driven through server actions + the adapter, not called from the browser.
 *
 * This path must stay in the middleware public allowlist.
 */
const handler = toNextJsHandler(auth.handler);

/**
 * The `admin` plugin (spec 6) mounts /api/auth/admin/* — a SECOND path to
 * impersonate, ban and delete that bypasses our server actions and therefore the
 * audit log (spec 6.3). An audit log with an unaudited bypass does not do the one
 * job it exists for: constraining the most privileged actor in the system. So the
 * surface is closed here, leaving `src/features/admin/actions.ts` — which writes
 * the audit row — as the only way in.
 *
 * This costs the panel nothing: server-side `auth.api.*` calls invoke the plugin's
 * endpoints directly and never reach this handler.
 *
 * Keep it `startsWith` and keep the trailing slash: `includes` would match
 * unrelated paths, and dropping the slash would swallow a future /api/auth/administer.
 */
function blockedAdminSurface(request: NextRequest): NextResponse | null {
  return new URL(request.url).pathname.startsWith("/api/auth/admin/")
    ? NextResponse.json({ error: "Not found" }, { status: 404 })
    : null;
}

export function GET(request: NextRequest): Promise<Response> | Response {
  return blockedAdminSurface(request) ?? handler.GET(request);
}

export function POST(request: NextRequest): Promise<Response> | Response {
  return blockedAdminSurface(request) ?? handler.POST(request);
}
