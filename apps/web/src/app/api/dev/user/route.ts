import { type NextRequest } from "next/server";

import { proxyDev } from "../proxy";

/**
 * Test-only user lookup (spec 14.1) — forwards to the Nest dev controller.
 * Disabled in production.
 */
export function GET(request: NextRequest) {
  return proxyDev(request, "/v1/dev/user", "GET");
}
