import type { NextRequest } from "next/server";

import { proxyDev } from "@/app/api/dev/proxy";

/**
 * Test-only synchronous drain (spec 14.1) — forwards to Nest
 * (`POST /v1/dev/jobs/run`), which owns the drain since faza 2.3.
 * Determinism (finishes before answering) plus `fastForward` (day-3/day-7
 * steps testable in seconds, scoped by prefix or ids). 404 in production.
 */
export function POST(request: NextRequest) {
  return proxyDev(request, "/v1/dev/jobs/run", "POST");
}
