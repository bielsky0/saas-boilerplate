import { NextResponse, type NextRequest } from "next/server";

import { proxyDev } from "../proxy";

/**
 * Test-only MCP tool driver (spec 14.1 / 26) — forwards to the Nest dev
 * controller (`POST /v1/dev/mcp`, faza 2.7). Same contract as before
 * (`{email, tool, slug?}` → `{data}` or `{denied: true}`), so the E2E suite
 * calls it unchanged.
 */
export function POST(request: NextRequest): Promise<NextResponse> {
  return proxyDev(request, "/v1/dev/mcp", "POST");
}
