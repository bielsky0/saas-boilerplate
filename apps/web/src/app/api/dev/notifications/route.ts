import type { NextRequest } from "next/server";

import { proxyDev } from "@/app/api/dev/proxy";

/**
 * Test-only notification inspector (spec 14.1) — forwards to Nest
 * (`GET /v1/dev/notifications`), where notification rows are written since
 * faza 2.3. Lists a user's notifications across every owner context.
 * 404 in production.
 */
export function GET(request: NextRequest) {
  return proxyDev(request, "/v1/dev/notifications", "GET");
}
