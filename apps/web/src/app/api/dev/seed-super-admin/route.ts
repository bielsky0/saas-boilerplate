import { type NextRequest } from "next/server";

import { proxyDev } from "../proxy";

/**
 * Test-only super-admin promoter (spec 14.1) — forwards to the Nest dev
 * controller. Disabled in production.
 */
export function POST(request: NextRequest) {
  return proxyDev(request, "/v1/dev/seed-super-admin", "POST");
}
