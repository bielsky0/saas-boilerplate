import { type NextRequest } from "next/server";

import { proxyDev } from "../proxy";

/**
 * Test-only rate-limit exerciser (spec 14.1, 22.3) — forwards to the Nest dev
 * controller. Disabled in production.
 */
export function POST(request: NextRequest) {
  return proxyDev(request, "/v1/dev/rate-limit", "POST");
}
