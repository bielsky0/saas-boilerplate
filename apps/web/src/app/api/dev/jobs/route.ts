import type { NextRequest } from "next/server";

import { proxyDev } from "@/app/api/dev/proxy";

/**
 * Test-only job inspector (spec 14.1, 12.2) — forwards to Nest
 * (`GET /v1/dev/jobs`), which owns the queue since faza 2.3. Lets E2E assert
 * `status`/`attempts`/`lastError`/`runAt` (what proves a RETRY). 404 in
 * production.
 */
export function GET(request: NextRequest) {
  return proxyDev(request, "/v1/dev/jobs", "GET");
}
