import { NextResponse, type NextRequest } from "next/server";

import { fastForwardJobs } from "@/features/jobs/data";
import { registry } from "@/features/jobs/registry";
import { jobs } from "@/lib/adapters/jobs";
import { env } from "@/lib/env/server";

/**
 * Test-only synchronous drain (spec 14.1).
 *
 * Two things E2E needs that `kickDrain()` cannot give it:
 *   - DETERMINISM. `after()` runs post-response, so a test that awaited a request
 *     has no idea whether the drain has happened. This one finishes before it
 *     answers.
 *   - FAKE TIME. `fastForward` pulls scheduled jobs into the present, so the §10.3
 *     day-3 and day-7 steps are testable without waiting a week. A clock mock is
 *     not an option against a built production server.
 *
 * Disabled in production.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    dedupeKeyPrefix?: unknown;
    jobIds?: unknown;
    fastForward?: unknown;
  };
  const dedupeKeyPrefix =
    typeof body.dedupeKeyPrefix === "string" ? body.dedupeKeyPrefix : undefined;
  const ids = Array.isArray(body.jobIds)
    ? body.jobIds.filter((v): v is string => typeof v === "string")
    : undefined;

  let fastForwarded = 0;
  if (body.fastForward === true) {
    // A SCOPE is REQUIRED to fast-forward, and this is a correctness guard rather
    // than tidiness: the suite runs fullyParallel against one shared database with
    // no teardown, so an unscoped fast-forward would yank another spec's scheduled
    // jobs into the present and fail it, from a different file, at random.
    if (!dedupeKeyPrefix && !ids?.length) {
      return NextResponse.json(
        { error: "`dedupeKeyPrefix` or `jobIds` is required when fastForward is true" },
        { status: 400 },
      );
    }
    fastForwarded = await fastForwardJobs({ dedupeKeyPrefix, ids });
  }

  const result = await jobs.drain(registry, { budgetMs: 20_000 });
  return NextResponse.json({ fastForwarded, ...result });
}
