import type { NextRequest } from "next/server";

import { proxyDev } from "@/app/api/dev/proxy";

/**
 * Test-only preference setter (spec 14.1) — forwards to Nest
 * (`POST /v1/dev/notification-preference`). Lets a spec turn a user's
 * in-app channel OFF for one type. Body: { email, type, inAppEnabled }.
 * 404 in production.
 */
export function POST(request: NextRequest) {
  return proxyDev(request, "/v1/dev/notification-preference", "POST");
}
