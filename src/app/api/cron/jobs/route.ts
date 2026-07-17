import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { jobs } from "@/lib/adapters/jobs";
import { registry } from "@/features/jobs/registry";
import { jobStats } from "@/features/jobs/data";
import { db } from "@/lib/db";
import { env } from "@/lib/env/server";
import { requestLogger } from "@/lib/logger";

/**
 * Job drain endpoint (spec 12) — THE DELIVERY GUARANTEE.
 *
 * `kickDrain()` runs the happy path after a response, but it is only an
 * optimization: retries, the §10.3 sequence's day-3/day-7 steps, and every cron
 * task exist solely because this endpoint is called. If nothing calls it, mail
 * still appears to work — right up until the first provider blip, which then never
 * recovers. That asymmetry is why CRON_SECRET's absence answers 404 loudly rather
 * than degrading quietly.
 *
 * AUTHENTICATION: a bearer token, not a Vercel signature. Vercel Cron attaches
 * `Authorization: Bearer $CRON_SECRET` automatically; a Docker sidecar, systemd
 * timer, or external pinger sends the identical header. ONE mechanism serves both
 * deploy targets — `x-vercel-signature` would make a critical path Vercel-only,
 * which spec 19.1 forbids.
 *
 * GET because that is what Vercel Cron issues. It mutates, which a GET should not,
 * and the mitigating fact is that it is not reachable without the secret and is
 * idempotent in effect (draining an empty queue is a no-op).
 */

const BATCH_BUDGET_MS = 50_000;

function authorized(request: NextRequest): boolean {
  if (!env.CRON_SECRET) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.CRON_SECRET}`;
  // Length check first: timingSafeEqual THROWS on a length mismatch, and a plain
  // `===` on a secret is a timing oracle.
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // No secret configured = this deployment has no drain endpoint, mirroring
  // BILLING_PROVIDER=none on the webhook route.
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Self-schedule the daily housekeeping (spec 12.1). Keyed by date, and since a
  // dedupeKey is unique forever, that yields exactly one prune per calendar day no
  // matter how often this endpoint is pinged. Enqueuing here rather than adding a
  // second cron entry keeps recurring work in ONE place: a new periodic task is a
  // line in this list, not another platform-specific schedule to configure.
  const today = new Date().toISOString().slice(0, 10);
  await jobs.enqueue(db, "job.prune", {}, { dedupeKey: `job.prune:${today}` });

  const result = await jobs.drain(registry, { budgetMs: BATCH_BUDGET_MS });
  const stats = await jobStats();

  // §12.2 observability: one structured line per drain is the "przynajmniej w
  // logach" floor, and it is what makes a growing backlog visible without a UI.
  const log = await requestLogger("jobs");
  log.info("drain", {
    claimed: result.claimed,
    ok: result.succeeded,
    retried: result.retried,
    dead: result.deadLettered,
    queue: stats,
  });

  return NextResponse.json({ ...result, queue: stats });
}
