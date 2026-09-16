import { type NextRequest } from "next/server";

import { proxyDev } from "../proxy";

/**
 * Test-only account seeder (spec 14.1) — forwards to the Nest dev controller.
 * Disabled in production.
 */
export function POST(request: NextRequest) {
  return proxyDev(request, "/v1/dev/seed-user", "POST");
}
