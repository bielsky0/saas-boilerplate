import { NextResponse, type NextRequest } from "next/server";

import { impersonateUserSchema } from "@/features/admin/schema";
import { env } from "@/lib/env/server";
import { apiError, invalidJson, validationFailed } from "@/lib/validation/http";

/**
 * Start impersonating (spec 6.2) — the ONLY cookie-swapping relay besides the
 * auth proxy (faza 2.6).
 *
 * The browser talks to WEB, the session lives in NEST: this route forwards
 * the call to `POST /v1/admin/users/:id/impersonate` and copies the engine's
 * `Set-Cookie` from the API response onto the browser response. Same-origin,
 * so the swapped session is a first-party cookie even when the API itself
 * lives on another origin (Vercel web + VPS API).
 *
 * After the relay there is deliberately NO session read (stale-cookie): the
 * request headers still carry the OLD cookie for this whole request, and the
 * new truth is the response cookies the browser is about to store. The client
 * navigates to `/dashboard` next, which resolves the new session.
 *
 * `redirect: "manual"` is load-bearing for the same reason as in the auth
 * proxy: following a redirect here would swallow the swapped cookie.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object") return invalidJson();

  const { userId, reason } = raw as { userId?: unknown; reason?: unknown };
  const parsed = impersonateUserSchema.safeParse({ userId, reason });
  if (!parsed.success) return validationFailed(parsed.error);

  const target = new URL(
    `/v1/admin/users/${encodeURIComponent(parsed.data.userId)}/impersonate`,
    env.API_BASE_URL.replace(/\/+$/, ""),
  );

  const headers = new Headers();
  headers.set("content-type", "application/json");
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers,
      redirect: "manual",
      body: JSON.stringify({ reason: parsed.data.reason }),
    });
  } catch {
    return apiError("Authentication service unavailable", 502);
  }

  const res = new NextResponse(Buffer.from(await upstream.arrayBuffer()), {
    status: upstream.status,
  });
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.headers.set("content-type", contentType);
  // Never merged: one `Set-Cookie` per header, or the browser keeps only one
  // session and the impersonation stack vanishes.
  const setCookies =
    typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
  for (const cookieValue of setCookies) res.headers.append("set-cookie", cookieValue);
  return res;
}
