import { Controller, Get, Inject, Logger, Req } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import type { Db } from "@repo/db";
import { notFound, unauthorized } from "../common/http";
import { JobsService } from "./jobs.service";

/**
 * Job drain endpoint (spec 12) — THE DELIVERY GUARANTEE. The Nest twin of
 * web's `src/app/api/cron/jobs/route.ts`, which now forwards here.
 *
 * `kickDrain()` runs the happy path after an enqueue, but it is only an
 * optimization: retries, the §10.3 sequence's day-3/day-7 steps, and every
 * cron task exist solely because this endpoint is called. If nothing calls
 * it, mail still appears to work — right up until the first provider blip,
 * which then never recovers. That asymmetry is why an unset CRON_SECRET
 * answers 404 loudly rather than degrading quietly.
 *
 * AUTHENTICATION: a bearer token, not a Vercel signature. Vercel Cron
 * attaches `Authorization: Bearer $CRON_SECRET` automatically; a Docker
 * sidecar, systemd timer, or external pinger sends the identical header. ONE
 * mechanism serves both deploy targets.
 *
 * GET because that is what Vercel Cron issues. It mutates, which a GET should
 * not, and the mitigating fact is that it is not reachable without the secret
 * and is idempotent in effect (draining an empty queue is a no-op).
 */

const BATCH_BUDGET_MS = 50_000;

@Controller("v1/cron")
export class CronController {
  private readonly log = new Logger("CronController");

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly jobs: JobsService,
  ) {}

  private authorized(header: string | undefined): boolean {
    if (!this.config.CRON_SECRET) return false;
    const expected = `Bearer ${this.config.CRON_SECRET}`;
    // Length check first: timingSafeEqual THROWS on a length mismatch, and a
    // plain `===` on a secret is a timing oracle.
    const a = Buffer.from(header ?? "");
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  @Get("jobs")
  async drain(@Req() req: Request) {
    // No secret configured = this deployment has no drain endpoint, mirroring
    // BILLING_PROVIDER=none on the webhook route.
    if (!this.config.CRON_SECRET) notFound();
    if (!this.authorized(req.headers.authorization)) unauthorized();

    // Self-schedule the daily housekeeping (spec 12.1). Keyed by date, and
    // since a dedupeKey is unique forever, that yields exactly one prune per
    // calendar day no matter how often this endpoint is pinged. A new
    // periodic task is a line in this list, not another platform schedule.
    const today = new Date().toISOString().slice(0, 10);
    await this.jobs.enqueue(this.db, "job.prune", {}, { dedupeKey: `job.prune:${today}` });
    await this.jobs.enqueue(this.db, "storage.purge", {}, { dedupeKey: `storage.purge:${today}` });
    // Rate-limit counter reclaim (spec 22.3): HOURLY, not daily — rate-limit
    // rows are one per client per bucket and expire in minutes, so a daily
    // cadence would carry a full day of dead rows on the request path's table.
    const thisHour = new Date().toISOString().slice(0, 13);
    await this.jobs.enqueue(
      this.db,
      "ratelimit.prune",
      {},
      { dedupeKey: `ratelimit.prune:${thisHour}` },
    );

    const result = await this.jobs.drainWithOwnRegistry({ budgetMs: BATCH_BUDGET_MS });
    const stats = await this.jobs.jobStats();

    // §12.2 observability: one structured line per drain is the floor, and it
    // is what makes a growing backlog visible without a UI.
    this.log.log(
      `drain claimed=${result.claimed} ok=${result.succeeded} retried=${result.retried} dead=${result.deadLettered} queue=${JSON.stringify(stats)}`,
    );

    return { ...result, queue: stats };
  }
}
