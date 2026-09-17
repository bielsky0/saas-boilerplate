import type { NextRequest } from "next/server";

import { proxyDev } from "@/app/api/dev/proxy";

/**
 * Test-only inspector for the dev email outbox (spec 14.1) — forwards to
 * Nest (`GET /v1/dev/emails`), where the outbox lives since the drain moved
 * there (faza 2.3). E2E reads verification links from here. 404 in production.
 */
export function GET(request: NextRequest) {
  return proxyDev(request, "/v1/dev/emails", "GET");
}
