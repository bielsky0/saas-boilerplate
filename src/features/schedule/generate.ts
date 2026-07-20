import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import type { JobHandler } from "@/lib/adapters/jobs";
import { classSession, groupType, groupTypeRecurrence } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { getOrgById } from "@/features/organizations/data";
import { withTenant, type TenantDb } from "@/lib/db/tenant";
import {
  SQLSTATE_EXCLUSION_VIOLATION,
  SQLSTATE_UNIQUE_VIOLATION,
  sqlStateOf,
} from "@/lib/db/sql-error";
import { generateOccurrences } from "./recurrence";

const log = createLogger("schedule");

/**
 * Season generation for Schedule-First (langlion §2.2, EPIK 3).
 *
 * Saving a recurring pattern generates its season; there is no separate
 * "Generate" button (US-3.1/AC1). Two callers share the function below, and they
 * differ only in where the tenant context comes from:
 *
 *   - the action, INLINE in its own transaction, for `isRecurring=false` — which
 *     must produce exactly one session synchronously (US-3.1/AC2);
 *   - the job handler at the bottom, in a context it opens itself, for a season.
 *
 * Sharing one function is the point. Two implementations of "expand a pattern
 * into rows" would drift on exactly the details that are hard to see: which
 * location is inherited, whether the unique constraint is targeted, what happens
 * to a trainer collision.
 */

/**
 * Why the outcome is a report and not a thrown error.
 *
 * A season is dozens of rows and two things can legitimately refuse ONE of them
 * while the rest are fine: the pattern was already generated (§4.4 unique →
 * 23505, which is what makes extending a season idempotent, US-3.2/AC2), or the
 * trainer is already teaching at that instant (§5.1 exclusion → 23P01). Aborting
 * the whole batch for either would be wrong in opposite directions — the first is
 * not a failure at all, and the second would let one collision in week 12 cancel
 * the other 29 weeks.
 *
 * The same partial-success shape the spec asks for in §3.4/AC7 and §2.11 (mass
 * trainer reassignment). Nothing here silently swallows a collision: it is
 * counted, logged, and handed back for the caller to show.
 */
export type GenerationReport = {
  created: number;
  /** Already present — the idempotency signal, not an error (US-3.2/AC2). */
  skippedExisting: number;
  /** Instants refused by the §5.1 trainer exclusion constraint. */
  trainerConflicts: Date[];
};

/**
 * Expand one pattern into `class_session` rows.
 *
 * `tx` must already carry the tenant context; this function never opens one,
 * because its two callers acquire it differently and one of them needs the
 * inserts to be atomic with its own writes.
 *
 * PER-ROW SAVEPOINTS, not per-row transactions. `tx.transaction()` inside an open
 * transaction opens a SAVEPOINT (see `withOwner`'s header, decyzja D15), so a
 * refused insert rolls back only itself and leaves `tx` usable — which is what
 * makes "skip this one occurrence" expressible at all. Without the savepoint the
 * first 23P01 would poison the enclosing transaction and every subsequent
 * statement would fail with 25P02, turning one collision into a total failure
 * that LOOKS like a collision.
 *
 * The tenant GUC survives savepoint release (D15 again), so the nested handle is
 * still scoped to the same organization.
 */
export async function generateSessionsForRecurrence(
  tx: TenantDb,
  input: {
    organizationId: string;
    recurrenceId: string;
    groupTypeId: string;
    trainerId: string | null;
    /** Already resolved through the pattern → group type fallback (§2.12). */
    locationId: string | null;
    capacity: number;
    dayOfWeek: number;
    startTime: string;
    durationMinutes: number;
    startDate: string;
    occurrencesCount: number;
    timeZone: string;
  },
): Promise<GenerationReport> {
  const occurrences = generateOccurrences({
    startDate: input.startDate,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    occurrencesCount: input.occurrencesCount,
    timeZone: input.timeZone,
  });

  const report: GenerationReport = { created: 0, skippedExisting: 0, trainerConflicts: [] };

  for (const occurrence of occurrences) {
    try {
      await tx.transaction(async (savepoint) => {
        const inserted = await savepoint
          .insert(classSession)
          .values({
            organizationId: input.organizationId,
            groupTypeId: input.groupTypeId,
            trainerId: input.trainerId,
            startTime: occurrence.startsAt,
            endTime: occurrence.endsAt,
            capacity: input.capacity,
            locationId: input.locationId,
            generatedFromRecurrenceId: input.recurrenceId,
          })
          // §4.4. Targeted at the (recurrence, start) unique, so re-running a
          // generation inserts only the dates that are missing — which is exactly
          // what extending `occurrencesCount` from 30 to 40 needs (US-3.2/AC1).
          //
          // DO NOTHING, not DO UPDATE, and that is load-bearing under RLS: DO
          // NOTHING only checks the INSERT's WITH CHECK and stays a silent no-op,
          // whereas DO UPDATE against a row invisible under USING raises 42501
          // (see "RLS and ON CONFLICT" in ARCHITECTURE.md). Overwriting would also
          // be wrong on its own terms — an already-generated session is a
          // Realisation with its own life, possibly hand-adjusted and possibly
          // carrying bookings (Zasada nadrzędna #1).
          .onConflictDoNothing({
            target: [classSession.generatedFromRecurrenceId, classSession.startTime],
          })
          .returning({ id: classSession.id });

        if (inserted.length > 0) report.created += 1;
        else report.skippedExisting += 1;
      });
    } catch (error) {
      const sqlState = sqlStateOf(error);
      if (sqlState === SQLSTATE_EXCLUSION_VIOLATION) {
        // §5.1 — the trainer is already teaching then. A hard skip until Force
        // Override arrives in F18; there is deliberately no way to bypass it here.
        report.trainerConflicts.push(occurrence.startsAt);
        continue;
      }
      // A 23505 is impossible on this path (the ON CONFLICT above absorbs it), so
      // reaching here with one means the constraint moved. Anything else is a
      // genuine fault — let the job retry lane and the action's error path see it.
      if (sqlState === SQLSTATE_UNIQUE_VIOLATION) {
        log.warn("unexpected unique violation during generation", {
          recurrenceId: input.recurrenceId,
          startsAt: occurrence.startsAt.toISOString(),
        });
      }
      throw error;
    }
  }

  return report;
}

/**
 * The job payload, re-validated on the way out of jsonb.
 *
 * Not ceremony: a payload round-trips through a jsonb column and comes back
 * UNTYPED while TypeScript still claims otherwise (see the adapter contract's
 * header). Parsing here is what makes the handler's assumptions true rather than
 * merely declared.
 */
const generateJobSchema = z.object({
  organizationId: z.string().min(1),
  recurrenceId: z.string().min(1),
});

/**
 * Season generation as a background job (US-3.1/AC1).
 *
 * OPENS ITS OWN TENANT CONTEXT, and this is the single most important line in the
 * file. The handler runs AFTER the transaction that enqueued it has committed and
 * the request is gone — no session, no `OrgContext`, no ambient tenant. Every
 * table it reads is under RLS with FORCE. A handler that forgot `withTenant`
 * would not throw: it would read zero rows, find no pattern, conclude there was
 * no work, and report success. Forever, for every academy.
 *
 * IDEMPOTENT by construction, as §12.2 requires of a re-claimable job: the work
 * is `ON CONFLICT DO NOTHING` against the §4.4 unique, so a second delivery
 * creates nothing and reports every occurrence as already present.
 */
export const sessionsGenerateHandler: JobHandler<"sessions.generate"> = async (raw) => {
  const payload = generateJobSchema.parse(raw);

  // Read outside the tenant transaction: `organization` carries no policy (it is
  // the row that DEFINES the owner — decyzja D17), and opening the tenant
  // transaction first would mean holding a pooled connection across this query.
  const org = await getOrgById(payload.organizationId);
  if (!org) {
    // The academy was deleted between enqueue and drain. Nothing to generate, and
    // nothing wrong either — returning lets the job complete instead of retrying
    // against a tenant that will never come back.
    log.warn("season generation skipped: organization is gone", payload);
    return;
  }

  const report = await withTenant(payload.organizationId, async (tx) => {
    const [pattern] = await tx
      .select({
        id: groupTypeRecurrence.id,
        groupTypeId: groupTypeRecurrence.groupTypeId,
        trainerId: groupTypeRecurrence.trainerId,
        locationId: groupTypeRecurrence.locationId,
        capacity: groupTypeRecurrence.capacity,
        dayOfWeek: groupTypeRecurrence.dayOfWeek,
        startTime: groupTypeRecurrence.startTime,
        durationMinutes: groupTypeRecurrence.durationMinutes,
        startDate: groupTypeRecurrence.startDate,
        occurrencesCount: groupTypeRecurrence.occurrencesCount,
        isRecurring: groupTypeRecurrence.isRecurring,
        defaultLocationId: groupType.defaultLocationId,
      })
      .from(groupTypeRecurrence)
      .innerJoin(
        groupType,
        and(
          eq(groupType.id, groupTypeRecurrence.groupTypeId),
          eq(groupType.organizationId, groupTypeRecurrence.organizationId),
        ),
      )
      .where(
        and(
          eq(groupTypeRecurrence.id, payload.recurrenceId),
          eq(groupTypeRecurrence.organizationId, payload.organizationId),
          isNull(groupTypeRecurrence.deletedAt),
        ),
      )
      .limit(1);

    // Deleted, or flipped to non-recurring, between enqueue and drain. Both are
    // ordinary races rather than faults — the pattern's current state is the
    // authority, not the payload's snapshot of it.
    if (!pattern?.isRecurring || !pattern.occurrencesCount) return null;

    return generateSessionsForRecurrence(tx, {
      organizationId: payload.organizationId,
      recurrenceId: pattern.id,
      groupTypeId: pattern.groupTypeId,
      trainerId: pattern.trainerId,
      // §2.12's three-step inheritance, resolved at generation time: the pattern
      // overrides the group type's default when set. Resolved HERE rather than
      // read back later, because `session.locationId` is a copy that then lives
      // its own life and stays editable per session (US-22.3).
      locationId: pattern.locationId ?? pattern.defaultLocationId,
      capacity: pattern.capacity,
      dayOfWeek: pattern.dayOfWeek,
      startTime: pattern.startTime,
      durationMinutes: pattern.durationMinutes,
      startDate: pattern.startDate,
      occurrencesCount: pattern.occurrencesCount,
      // US-1.2/AC1 — the academy's zone, never the server's. `recurrence.ts` does
      // the DST-correct conversion; this is only where the zone comes from.
      timeZone: org.timezone,
    });
  });

  if (!report) {
    log.info("season generation skipped: pattern gone or no longer recurring", payload);
    return;
  }

  log.info("season generated", {
    ...payload,
    created: report.created,
    skippedExisting: report.skippedExisting,
    trainerConflicts: report.trainerConflicts.length,
  });
};
