import { type NextRequest } from "next/server";

import { proxyDev } from "../proxy";

/**
 * Test-only organization seeder (spec 14.1) — forwards to the Nest dev
 * controller (faza 2.2). Same contract, so the E2E suite calls it unchanged.
 * Disabled in production.
 */
export function POST(request: NextRequest) {
  return proxyDev(request, "/v1/dev/seed-org", "POST");
}
