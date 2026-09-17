import type { NextRequest } from "next/server";

import { proxyDev } from "@/app/api/dev/proxy";

/**
 * Test-only provider-outage simulator (spec 14.1) — forwards to Nest
 * (`POST /v1/dev/emails/fail-next`), whose log adapter throws the next
 * `times` sends to `to`. Per-address, because the suite boots one server.
 * 404 in production.
 */
export function POST(request: NextRequest) {
  return proxyDev(request, "/v1/dev/emails/fail-next", "POST");
}
