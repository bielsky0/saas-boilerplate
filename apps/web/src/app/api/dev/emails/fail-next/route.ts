import { NextResponse, type NextRequest } from "next/server";

import { failFor, pendingFailures } from "@/lib/adapters/email";
import { env } from "@/lib/env/server";

/**
 * Test-only provider-outage simulator (spec 14.1). Makes the next `times` sends to
 * `to` throw, so E2E can prove the queue actually retries with backoff.
 *
 * Per-ADDRESS rather than a global switch, because playwright.config.ts boots one
 * server for the whole suite: a global "fail everything" flag would break every
 * concurrently-running test. Disabled in production.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as { to?: unknown; times?: unknown };
  const to = typeof body.to === "string" ? body.to : null;
  const times = typeof body.times === "number" ? body.times : 1;
  if (!to) {
    return NextResponse.json({ error: "`to` is required" }, { status: 400 });
  }

  failFor(to, times);
  return NextResponse.json({ to, pending: pendingFailures(to) });
}
