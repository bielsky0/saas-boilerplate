import { type NextRequest } from "next/server";

import { proxyDev } from "../proxy";

/**
 * Test-only billing state inspector (spec 14.1) — forwards to the Nest dev
 * controller. Disabled in production.
 *
 * GET /api/dev/billing-state?orgSlug=acme
 */
export function GET(request: NextRequest) {
  return proxyDev(request, "/v1/dev/billing-state", "GET");
}
