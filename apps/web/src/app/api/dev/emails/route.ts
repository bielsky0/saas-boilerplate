import { NextResponse, type NextRequest } from "next/server";

import { getOutbox } from "@/lib/adapters/email";
import { env } from "@/lib/env/server";

/**
 * Test-only inspector for the dev email outbox (spec 14.1). E2E tests read the
 * verification link from here instead of a real inbox. Disabled in production.
 */
export function GET(request: NextRequest): NextResponse {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const to = request.nextUrl.searchParams.get("to") ?? undefined;
  return NextResponse.json({ emails: getOutbox(to) });
}
