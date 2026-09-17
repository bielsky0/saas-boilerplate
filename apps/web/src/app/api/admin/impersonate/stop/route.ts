import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env/server";
import { apiError } from "@/lib/validation/http";

/**
 * Leave admin mode (spec 6.2) — the companion relay to `../route.ts`.
 *
 * Same shape: forward the (impersonated) cookie to Nest, copy the restored
 * session's `Set-Cookie` back. The request is authorized by the session's own
 * `impersonatedBy`, not by admin rights — the impersonated user must always
 * be able to get out, including from the 403 page. No session read after the
 * relay, for the same stale-cookie reason as the start route.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const target = new URL("/v1/admin/impersonate/stop", env.API_BASE_URL.replace(/\/+$/, ""));

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  let upstream: Response;
  try {
    upstream = await fetch(target, { method: "POST", headers, redirect: "manual" });
  } catch {
    return apiError("Authentication service unavailable", 502);
  }

  const res = new NextResponse(Buffer.from(await upstream.arrayBuffer()), {
    status: upstream.status,
  });
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.headers.set("content-type", contentType);
  const setCookies =
    typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
  for (const cookieValue of setCookies) res.headers.append("set-cookie", cookieValue);
  return res;
}
