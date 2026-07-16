import { NextResponse, type NextRequest } from "next/server";

import { jobStats, listJobs } from "@/features/jobs/data";
import { env } from "@/lib/env/server";

/**
 * Test-only job inspector (spec 14.1, 12.2).
 *
 * Lets E2E assert `status`/`attempts`/`lastError`/`runAt` — which is what proves a
 * RETRY happened, as opposed to merely observing that an email eventually showed
 * up. Disabled in production.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const jobs = await listJobs({
    dedupeKeyPrefix: params.get("dedupeKeyPrefix") ?? undefined,
    to: params.get("to") ?? undefined,
    id: params.get("id") ?? undefined,
  });

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      dedupeKey: j.dedupeKey,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      lastError: j.lastError,
      runAt: j.runAt.toISOString(),
      createdAt: j.createdAt.toISOString(),
      // Exposed so a test can assert the success-path SCRUB actually happened.
      // Without it, "the payload no longer holds the raw invite link" would be
      // untestable — and a scrub nobody checks is a scrub that silently regresses.
      payload: j.payload,
    })),
    queue: await jobStats(),
  });
}
