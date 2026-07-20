import { and, eq, inArray, lte, sql } from "drizzle-orm";

import type { JobHandler } from "@/lib/adapters/jobs";
import { credit } from "@/lib/db/schema";
import { withSystemBypass } from "@/lib/db/system";
import { withTenant } from "@/lib/db/tenant";
import { createLogger } from "@/lib/logger";

const log = createLogger("credits");

/**
 * Credit expiry sweep (langlion §1.2, US-1.2/AC3).
 *
 * WHAT THIS JOB IS AND IS NOT. It does not decide when a credit dies — that was
 * decided at issue time, by the instant in `validUntil` (see `validity.ts`), and
 * every reader honours it directly: `claimCredit` will not spend a lapsed credit
 * and `listAvailableCredits` will not show one, whether or not this job has run.
 * The sweep only makes the state on the row agree with the clock, so that
 * `status` is a fact rather than a claim awaiting arithmetic.
 *
 * That ordering matters for a deployment reason as much as a correctness one:
 * Vercel Hobby's cron is daily-only and an external pinger can miss a day
 * (ARCHITECTURE.md, "Background jobs in production"). A job whose absence let
 * dead credits be spent would make availability depend on infrastructure uptime.
 * This one's absence is visible only as a stale `status` column.
 *
 * ⚠️ NARROW BYPASS, the same shape as `storage/purge.ts` (D19). Credits expire on
 * their own clock in every academy at once, so the WORK LIST cannot name a
 * tenant — there is no `organizationId` to scope by until the rows come back. The
 * bypass therefore covers only that read; each update below re-enters the context
 * of the rows' OWN organization, so the policy's `WITH CHECK` stays load-bearing
 * exactly where a tenant mix-up would destroy value a parent paid for.
 *
 * Idempotent by construction, as §12.2 requires of a re-claimable job: the update
 * is predicated on `status = 'available'`, so a second delivery finds nothing left
 * to change and reports zero.
 */

/** Bounded so one run cannot take a long lock on a table the booking path writes to. */
const BATCH_SIZE = 500;

export const creditsExpireHandler: JobHandler<"credits.expire"> = async () => {
  const now = new Date();

  const due = await withSystemBypass(
    "credit expiry sweep — credits lapse in every academy at once",
    (tx) =>
      tx
        .select({ id: credit.id, organizationId: credit.organizationId })
        .from(credit)
        .where(and(eq(credit.status, "available"), lte(credit.validUntil, now)))
        .orderBy(credit.validUntil)
        .limit(BATCH_SIZE),
  );

  if (due.length === 0) {
    log.info("credit expiry sweep: nothing due");
    return;
  }

  // Group by tenant so each academy's rows are updated in one statement inside
  // one context, rather than one transaction per credit.
  const byOrganization = new Map<string, string[]>();
  for (const row of due) {
    const ids = byOrganization.get(row.organizationId) ?? [];
    ids.push(row.id);
    byOrganization.set(row.organizationId, ids);
  }

  let expired = 0;
  for (const [organizationId, ids] of byOrganization) {
    const updated = await withTenant(organizationId, (tx) =>
      tx
        .update(credit)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(
            eq(credit.organizationId, organizationId),
            inArray(credit.id, ids),
            // Re-checked inside the tenant transaction, not merely inherited from
            // the work list: a credit may have been spent between the sweep's read
            // and this write, and overwriting `used` with `expired` would erase the
            // record of what a booking was paid with.
            eq(credit.status, "available"),
            lte(credit.validUntil, sql`now()`),
          ),
        )
        .returning({ id: credit.id }),
    );
    expired += updated.length;
  }

  // No audit row, unlike `storage.purge`. That job destroys data a tenant could
  // otherwise still recover; this one records the passage of a deadline the
  // parent was told about when they bought. The credit row itself remains, with
  // its `validUntil` intact, which answers "why is this gone" completely.
  log.info("expired lapsed credits", {
    expired,
    scanned: due.length,
    organizations: byOrganization.size,
    // A full batch means more are waiting; the next run picks them up. Logged so
    // a persistent backlog is visible without a UI (§12.2).
    saturated: due.length === BATCH_SIZE,
  });
};
