"use server";

import { and, eq, gte, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { changed, recordAudit, resolveActor, withImpersonation } from "@/features/admin/audit";
import { enqueueJob } from "@/features/jobs";
import { requireOrgPermission } from "@/features/organizations/context";
import { generateSessionsForRecurrence } from "@/features/schedule/generate";
import { generateOccurrences } from "@/features/schedule/recurrence";
import { classSession, groupType, groupTypeRecurrence, location } from "@/lib/db/schema";
import { withTenant, type TenantDb } from "@/lib/db/tenant";
import {
  SQLSTATE_EXCLUSION_VIOLATION,
  SQLSTATE_UNIQUE_VIOLATION,
  sqlStateOf,
} from "@/lib/db/sql-error";
import type { FormState } from "@/lib/validation";
import { createGroupTypeSchema, createRecurrenceSchema } from "./schema";
import {
  GroupTypeDeactivationBlockedError,
  GroupTypeNotFoundError,
  deactivateGroupType,
} from "./deactivate";

/**
 * Group type + recurrence server actions (langlion EPIK 2, EPIK 3, §2.2, §2.12).
 *
 * Everything here is the DEFINITION half of Zasada nadrzędna #1. The one place
 * that reaches across into Realisations is `updateRecurrenceAction`, and it is
 * the most delicate code in this phase — see its header.
 *
 * Conventions inherited from the boilerplate's org actions and not restated at
 * every call site: `requireOrgPermission` first (§4.2), `resolveActor` awaited
 * before the transaction opens (deadlock — `features/admin/audit.ts`), audit row
 * inside the same transaction as the write (Rule A).
 */

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function strList(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === "string");
}

/**
 * Confirm a location belongs to this academy before pointing at it.
 *
 * The composite foreign keys already make a cross-tenant location structurally
 * impossible (`schema/locations.ts`), so this is not the security boundary — it
 * exists to turn a 23503 stack trace into a field error the admin can act on.
 */
async function locationBelongsToOrg(
  tx: TenantDb,
  organizationId: string,
  locationId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: location.id })
    .from(location)
    .where(
      and(
        eq(location.id, locationId),
        eq(location.organizationId, organizationId),
        isNull(location.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// --- Group type (Definition) -------------------------------------------------

export async function createGroupTypeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrgPermission("group_types.manage");
  const [t, tv] = await Promise.all([
    getTranslations("groups"),
    getTranslations("groups.validation"),
  ]);

  const parsed = createGroupTypeSchema(tv).safeParse({
    name: str(formData.get("name")),
    slug: str(formData.get("groupSlug")),
    description: str(formData.get("description")) || undefined,
    engine: str(formData.get("engine")),
    paymentPolicy: str(formData.get("paymentPolicy")),
    price: str(formData.get("price")),
    isNewClientOnly: formData.get("isNewClientOnly") === "on",
    defaultLocationId: str(formData.get("defaultLocationId")) || undefined,
    allowedPurchaseModes: strList(formData, "allowedPurchaseModes"),
    allowedBillingTypes: strList(formData, "allowedBillingTypes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("errors.generic") };
  }

  const actor = await resolveActor(ctx.session);

  try {
    await withTenant(ctx.org.id, async (tx) => {
      if (
        parsed.data.defaultLocationId &&
        !(await locationBelongsToOrg(tx, ctx.org.id, parsed.data.defaultLocationId))
      ) {
        throw new UnknownLocationError();
      }

      const [row] = await tx
        .insert(groupType)
        .values({
          organizationId: ctx.org.id,
          name: parsed.data.name,
          slug: parsed.data.slug,
          description: parsed.data.description ?? null,
          engine: parsed.data.engine,
          paymentPolicy: parsed.data.paymentPolicy,
          price: parsed.data.price,
          isNewClientOnly: parsed.data.isNewClientOnly,
          defaultLocationId: parsed.data.defaultLocationId ?? null,
          allowedPurchaseModes: parsed.data.allowedPurchaseModes,
          allowedBillingTypes: parsed.data.allowedBillingTypes ?? null,
        })
        .returning({ id: groupType.id });

      await recordAudit(tx, {
        actor,
        organizationId: ctx.org.id,
        action: "group_type.create",
        targetType: "group_type",
        targetId: row!.id,
        targetLabel: parsed.data.name,
      });
    });
  } catch (error) {
    if (error instanceof UnknownLocationError) return { error: t("errors.locationNotFound") };
    // The slug is unique per organization (decyzja D10), and losing the race with
    // a concurrent create is the ordinary way to hit it. A field error, not a 500.
    if (sqlStateOf(error) === SQLSTATE_UNIQUE_VIOLATION) return { error: t("errors.slugTaken") };
    throw error;
  }

  revalidatePath(`/dashboard/group-types`);
  return { success: t("created") };
}

/** Thrown inside a transaction to abort it and surface a field error. */
class UnknownLocationError extends Error {}

export async function updateGroupTypeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const groupTypeId = str(formData.get("groupTypeId"));
  const ctx = await requireOrgPermission("group_types.manage");
  const [t, tv] = await Promise.all([
    getTranslations("groups"),
    getTranslations("groups.validation"),
  ]);

  const parsed = createGroupTypeSchema(tv).safeParse({
    name: str(formData.get("name")),
    slug: str(formData.get("groupSlug")),
    description: str(formData.get("description")) || undefined,
    engine: str(formData.get("engine")),
    paymentPolicy: str(formData.get("paymentPolicy")),
    price: str(formData.get("price")),
    isNewClientOnly: formData.get("isNewClientOnly") === "on",
    defaultLocationId: str(formData.get("defaultLocationId")) || undefined,
    allowedPurchaseModes: strList(formData, "allowedPurchaseModes"),
    allowedBillingTypes: strList(formData, "allowedBillingTypes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("errors.generic") };
  }

  const actor = await resolveActor(ctx.session);

  let found = false;
  try {
    found = await withTenant(ctx.org.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(groupType)
        .where(
          and(
            eq(groupType.id, groupTypeId),
            eq(groupType.organizationId, ctx.org.id),
            isNull(groupType.deletedAt),
          ),
        )
        .limit(1);
      if (!before) return false;

      if (
        parsed.data.defaultLocationId &&
        !(await locationBelongsToOrg(tx, ctx.org.id, parsed.data.defaultLocationId))
      ) {
        throw new UnknownLocationError();
      }

      /**
       * NOTHING HERE TOUCHES ALREADY-GENERATED SESSIONS OR BOOKINGS, and that is
       * the whole of US-2.2. A price change moves the Definition only: existing
       * `booking.priceSnapshot` rows keep the price frozen at the moment they
       * were made (US-4.6), and sessions keep the capacity and location they were
       * generated with. The next session generated from a pattern picks up the
       * new values; the previous ones never look back.
       *
       * If a future phase ever wants "apply this to the rest of the season", it
       * belongs in an explicit, separately-audited action — not as a side effect
       * of saving a form.
       */
      const after = {
        name: parsed.data.name,
        slug: parsed.data.slug,
        description: parsed.data.description ?? null,
        engine: parsed.data.engine,
        paymentPolicy: parsed.data.paymentPolicy,
        price: parsed.data.price,
        isNewClientOnly: parsed.data.isNewClientOnly,
        defaultLocationId: parsed.data.defaultLocationId ?? null,
      };

      await tx
        .update(groupType)
        .set({
          ...after,
          allowedPurchaseModes: parsed.data.allowedPurchaseModes,
          allowedBillingTypes: parsed.data.allowedBillingTypes ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(groupType.id, groupTypeId), eq(groupType.organizationId, ctx.org.id)));

      await recordAudit(tx, {
        actor,
        organizationId: ctx.org.id,
        action: "group_type.update",
        targetType: "group_type",
        targetId: groupTypeId,
        targetLabel: after.name,
        metadata: withImpersonation(ctx.session, {
          changes: changed(before, after, [
            "name",
            "slug",
            "description",
            "engine",
            "paymentPolicy",
            "price",
            "isNewClientOnly",
            "defaultLocationId",
          ]),
        }),
      });
      return true;
    });
  } catch (error) {
    if (error instanceof UnknownLocationError) return { error: t("errors.locationNotFound") };
    if (sqlStateOf(error) === SQLSTATE_UNIQUE_VIOLATION) return { error: t("errors.slugTaken") };
    throw error;
  }

  if (!found) return { error: t("errors.notFound") };

  revalidatePath(`/dashboard/group-types`);
  revalidatePath(`/dashboard/group-types/${groupTypeId}`);
  return { success: t("updated") };
}

// --- Recurrence (pattern) ----------------------------------------------------

/**
 * Save a new pattern, and generate its sessions as an effect of that save.
 *
 * There is deliberately no "Generate" button anywhere in the UI (US-3.1/AC1).
 * The two paths differ only in where the work happens:
 *
 *   recurring     → `sessions.generate` job, enqueued in THIS transaction. The
 *                   outbox means a rolled-back save takes the job row with it, so
 *                   a season can never exist for a pattern that was not saved.
 *   non-recurring → exactly one session, INLINE and synchronously (US-3.1/AC2),
 *                   because "one session" is not background work and an admin
 *                   who creates a one-off expects to see it immediately.
 */
export async function createRecurrenceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrgPermission("sessions.generate_season");
  const [t, tg, tv] = await Promise.all([
    getTranslations("groups.recurrences"),
    getTranslations("groups"),
    getTranslations("groups.validation"),
  ]);

  const parsed = createRecurrenceSchema(tv).safeParse({
    groupTypeId: str(formData.get("groupTypeId")),
    dayOfWeek: str(formData.get("dayOfWeek")),
    startTime: str(formData.get("startTime")),
    durationMinutes: str(formData.get("durationMinutes")),
    trainerId: str(formData.get("trainerId")) || undefined,
    capacity: str(formData.get("capacity")),
    locationId: str(formData.get("locationId")) || undefined,
    isRecurring: formData.get("isRecurring") === "on",
    occurrencesCount: str(formData.get("occurrencesCount")) || undefined,
    startDate: str(formData.get("startDate")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? tg("errors.generic") };
  }

  const actor = await resolveActor(ctx.session);

  const outcome = await withTenant(ctx.org.id, async (tx) => {
    const [parent] = await tx
      .select({
        id: groupType.id,
        name: groupType.name,
        engine: groupType.engine,
        defaultLocationId: groupType.defaultLocationId,
      })
      .from(groupType)
      .where(
        and(
          eq(groupType.id, parsed.data.groupTypeId),
          eq(groupType.organizationId, ctx.org.id),
          isNull(groupType.deletedAt),
        ),
      )
      .limit(1);
    if (!parent) return { kind: "not-found" as const };

    // US-2.1/AC2 — Schedule-First patterns name a trainer. Enforced here rather
    // than in the zod schema because it is a fact about the PARENT group type,
    // which the form's own fields do not carry.
    if (parent.engine === "schedule_first" && !parsed.data.trainerId) {
      return { kind: "needs-trainer" as const };
    }

    if (
      parsed.data.locationId &&
      !(await locationBelongsToOrg(tx, ctx.org.id, parsed.data.locationId))
    ) {
      return { kind: "unknown-location" as const };
    }

    const [row] = await tx
      .insert(groupTypeRecurrence)
      .values({
        organizationId: ctx.org.id,
        groupTypeId: parent.id,
        dayOfWeek: parsed.data.dayOfWeek,
        startTime: parsed.data.startTime,
        durationMinutes: parsed.data.durationMinutes,
        trainerId: parsed.data.trainerId ?? null,
        capacity: parsed.data.capacity,
        locationId: parsed.data.locationId ?? null,
        isRecurring: parsed.data.isRecurring,
        occurrencesCount: parsed.data.isRecurring ? parsed.data.occurrencesCount! : null,
        startDate: parsed.data.startDate,
      })
      .returning({ id: groupTypeRecurrence.id });

    await recordAudit(tx, {
      actor,
      organizationId: ctx.org.id,
      action: "recurrence.create",
      targetType: "recurrence",
      targetId: row!.id,
      targetLabel: `${parent.name} · ${parsed.data.startTime}`,
    });

    if (parsed.data.isRecurring) {
      await enqueueJob(tx, "sessions.generate", {
        organizationId: ctx.org.id,
        recurrenceId: row!.id,
      });
      return { kind: "queued" as const, count: parsed.data.occurrencesCount! };
    }

    // One-off: generate inline, in this same transaction (US-3.1/AC2).
    const report = await generateSessionsForRecurrence(tx, {
      organizationId: ctx.org.id,
      recurrenceId: row!.id,
      groupTypeId: parent.id,
      trainerId: parsed.data.trainerId ?? null,
      locationId: parsed.data.locationId ?? parent.defaultLocationId,
      capacity: parsed.data.capacity,
      dayOfWeek: parsed.data.dayOfWeek,
      startTime: parsed.data.startTime,
      durationMinutes: parsed.data.durationMinutes,
      startDate: parsed.data.startDate,
      occurrencesCount: 1,
      timeZone: ctx.org.timezone,
    });
    return { kind: "generated" as const, report };
  });

  if (outcome.kind === "not-found") return { error: tg("errors.notFound") };
  if (outcome.kind === "needs-trainer") return { error: tg("errors.engineNeedsTrainer") };
  if (outcome.kind === "unknown-location") return { error: tg("errors.locationNotFound") };

  revalidatePath(`/dashboard/group-types/${parsed.data.groupTypeId}`);
  revalidatePath(`/dashboard/schedule`);

  if (outcome.kind === "queued") {
    return { success: `${t("created")} ${t("generationQueued", { count: outcome.count })}` };
  }
  // A one-off whose only occurrence collided with the trainer's schedule is a
  // saved pattern with no session — say so rather than reporting plain success.
  if (outcome.report.trainerConflicts.length > 0) {
    return {
      success: `${t("created")} ${t("skippedTrainerConflict", { count: outcome.report.trainerConflicts.length })}`,
    };
  }
  return { success: `${t("created")} ${t("generatedOne")}` };
}

/**
 * Edit a pattern mid-season (US-3.4, §2.2) — the delicate one.
 *
 * Changing a pattern's day, time or location updates every FUTURE, non-cancelled
 * session it generated, IN PLACE. Not by cancelling and recreating: the sessions
 * carry bookings, and a parent who booked Monday at 17:00 keeps their seat when
 * the class moves to 18:00 (AC3). History is never touched (AC2).
 *
 * Five things make this safe, and each one is a specific AC:
 *
 *  1. `FOR UPDATE` per session (AC6). The row lock serialises this edit against a
 *     booking being created on the same session, so whichever transaction takes
 *     the lock first wins and the second sees committed data rather than a
 *     phantom. Capacity checks in F5 take the same lock — that is the point.
 *
 *  2. `isManuallyAdjusted` rows are SKIPPED (AC8). An admin who moved one session
 *     by hand made a deliberate decision, and a bulk update that silently
 *     overwrote it would be the worst kind of data loss: invisible.
 *
 *  3. A per-session SAVEPOINT, so one refusal skips one session (AC7). The
 *     athlete-overlap constraint (§5.3) can refuse a specific move because a
 *     participant on that session has another booking at the new time. That is a
 *     real conflict about one date, and it must not roll back the other 29 weeks.
 *
 *  4. The denormalised `booking.sessionStartTime`/`sessionEndTime` are NOT
 *     updated here, and their absence is not an oversight (AC3). The composite FK
 *     with ON UPDATE CASCADE (decyzja D4) maintains them at the schema level, in
 *     this same statement. Adding a manual UPDATE would be dead code that looks
 *     load-bearing — and would diverge the day someone edited only one of them.
 *
 *  5. A trainer collision (§5.1) is a HARD SKIP, with no override. Force Override
 *     is F18 (AC5 is only partly realised until then); until it exists there is
 *     no code path that can push past this constraint, which is the honest state
 *     rather than a silent one.
 */
export async function updateRecurrenceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const recurrenceId = str(formData.get("recurrenceId"));
  const ctx = await requireOrgPermission("sessions.generate_season");
  const [t, tg, tv] = await Promise.all([
    getTranslations("groups.recurrences"),
    getTranslations("groups"),
    getTranslations("groups.validation"),
  ]);

  const parsed = createRecurrenceSchema(tv).safeParse({
    groupTypeId: str(formData.get("groupTypeId")),
    dayOfWeek: str(formData.get("dayOfWeek")),
    startTime: str(formData.get("startTime")),
    durationMinutes: str(formData.get("durationMinutes")),
    trainerId: str(formData.get("trainerId")) || undefined,
    capacity: str(formData.get("capacity")),
    locationId: str(formData.get("locationId")) || undefined,
    isRecurring: formData.get("isRecurring") === "on",
    occurrencesCount: str(formData.get("occurrencesCount")) || undefined,
    startDate: str(formData.get("startDate")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? tg("errors.generic") };
  }

  const actor = await resolveActor(ctx.session);
  const now = new Date();

  const outcome = await withTenant(ctx.org.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(groupTypeRecurrence)
      .where(
        and(
          eq(groupTypeRecurrence.id, recurrenceId),
          eq(groupTypeRecurrence.organizationId, ctx.org.id),
          isNull(groupTypeRecurrence.deletedAt),
        ),
      )
      .limit(1);
    if (!before) return { kind: "not-found" as const };

    const [parent] = await tx
      .select({
        id: groupType.id,
        name: groupType.name,
        defaultLocationId: groupType.defaultLocationId,
      })
      .from(groupType)
      .where(and(eq(groupType.id, before.groupTypeId), eq(groupType.organizationId, ctx.org.id)))
      .limit(1);
    if (!parent) return { kind: "not-found" as const };

    if (
      parsed.data.locationId &&
      !(await locationBelongsToOrg(tx, ctx.org.id, parsed.data.locationId))
    ) {
      return { kind: "unknown-location" as const };
    }

    const after = {
      dayOfWeek: parsed.data.dayOfWeek,
      startTime: parsed.data.startTime,
      durationMinutes: parsed.data.durationMinutes,
      trainerId: parsed.data.trainerId ?? null,
      capacity: parsed.data.capacity,
      locationId: parsed.data.locationId ?? null,
      isRecurring: parsed.data.isRecurring,
      occurrencesCount: parsed.data.isRecurring ? (parsed.data.occurrencesCount ?? null) : null,
      startDate: parsed.data.startDate,
    };

    await tx
      .update(groupTypeRecurrence)
      .set({ ...after, updatedAt: now })
      .where(
        and(
          eq(groupTypeRecurrence.id, recurrenceId),
          eq(groupTypeRecurrence.organizationId, ctx.org.id),
        ),
      );

    // Which future sessions this pattern owns. Cancelled ones are excluded: they
    // are a domain decision already taken, and moving a cancelled class is
    // meaningless. History is excluded by the `gte(now)` bound (AC2).
    const futureSessions = await tx
      .select({
        id: classSession.id,
        startTime: classSession.startTime,
        endTime: classSession.endTime,
        locationId: classSession.locationId,
        isManuallyAdjusted: classSession.isManuallyAdjusted,
      })
      .from(classSession)
      .where(
        and(
          eq(classSession.organizationId, ctx.org.id),
          eq(classSession.generatedFromRecurrenceId, recurrenceId),
          eq(classSession.status, "scheduled"),
          gte(classSession.startTime, now),
        ),
      )
      .orderBy(classSession.startTime)
      // AC6 — serialise against concurrent booking creation on these rows.
      .for("update");

    const resolvedLocationId = parsed.data.locationId ?? parent.defaultLocationId;

    /**
     * The remaining season, RECOMPUTED from the new pattern rather than shifted
     * by a delta.
     *
     * This is what makes a DAY change work at all. "Mondays 17:00" → "Tuesdays
     * 18:00" is not an offset applied to each existing instant; it is a different
     * series, and the N sessions still ahead of us take the next N slots of it.
     * Expanding the pattern also keeps DST correct for free (US-1.2/AC1), which a
     * millisecond delta would silently break for half the season.
     *
     * Anchored on today's local date, so the recomputed series starts with the
     * next matching weekday from now — the past is never rewritten (AC2).
     */
    const newOccurrences = generateOccurrences({
      startDate: localDateIn(ctx.org.timezone, now),
      dayOfWeek: parsed.data.dayOfWeek,
      startTime: parsed.data.startTime,
      durationMinutes: parsed.data.durationMinutes,
      occurrencesCount: futureSessions.length,
      timeZone: ctx.org.timezone,
    });

    let updated = 0;
    let skippedManual = 0;
    const trainerConflicts: string[] = [];
    const athleteConflicts: string[] = [];

    for (const [index, session] of futureSessions.entries()) {
      // AC8 — a hand-adjusted session is left exactly as the admin left it.
      //
      // Note it still CONSUMES its slot in the recomputed series rather than
      // being skipped over. Otherwise every session after it would shift a week
      // early, so protecting one session would quietly corrupt the rest — the
      // opposite of what the flag is for.
      if (session.isManuallyAdjusted) {
        skippedManual += 1;
        continue;
      }

      const target = newOccurrences[index];
      if (!target) break;
      const newStart = target.startsAt;
      const newEnd = target.endsAt;

      try {
        await tx.transaction(async (savepoint) => {
          await savepoint
            .update(classSession)
            .set({
              startTime: newStart,
              endTime: newEnd,
              trainerId: parsed.data.trainerId ?? null,
              capacity: parsed.data.capacity,
              locationId: resolvedLocationId,
              updatedAt: now,
            })
            .where(
              and(eq(classSession.id, session.id), eq(classSession.organizationId, ctx.org.id)),
            );
        });
        updated += 1;
      } catch (error) {
        // Both constraints raise 23P01, so the SQLSTATE alone cannot say which
        // one refused. The constraint NAME can, and it is the only place in this
        // codebase that reads one — justified because the two mean genuinely
        // different things to the admin: "your trainer is double-booked" is fixed
        // by moving a trainer, "a participant clashes" by moving one booking.
        if (sqlStateOf(error) === SQLSTATE_EXCLUSION_VIOLATION) {
          const message = error instanceof Error ? error.message : "";
          if (message.includes("booking_athlete_no_overlap_excl")) {
            athleteConflicts.push(session.id);
          } else {
            trainerConflicts.push(session.id);
          }
          continue;
        }
        throw error;
      }
    }

    await recordAudit(tx, {
      actor,
      organizationId: ctx.org.id,
      action: "recurrence.update",
      targetType: "recurrence",
      targetId: recurrenceId,
      targetLabel: `${parent.name} · ${parsed.data.startTime}`,
      metadata: withImpersonation(ctx.session, {
        changes: changed(before, after, [
          "dayOfWeek",
          "startTime",
          "durationMinutes",
          "trainerId",
          "capacity",
          "locationId",
          "isRecurring",
          "occurrencesCount",
          "startDate",
        ]),
        // The partial-success report belongs in the trail, not only in a toast
        // the admin may have dismissed. "Why is week 12 still at the old time?"
        // is answerable months later only if this was written down.
        sessionsUpdated: updated,
        skippedManual,
        trainerConflicts: trainerConflicts.length,
        athleteConflicts: athleteConflicts.length,
      }),
    });

    // Extending the season is the same job as generating it — idempotent through
    // the §4.4 unique, so it creates only the dates that are missing (US-3.2/AC1).
    // Enqueued in this transaction, after the pattern row already carries the new
    // `occurrencesCount`, so the handler reads the extended value.
    if (parsed.data.isRecurring) {
      await enqueueJob(tx, "sessions.generate", {
        organizationId: ctx.org.id,
        recurrenceId,
      });
    }

    return {
      kind: "updated" as const,
      updated,
      skippedManual,
      trainerConflicts: trainerConflicts.length,
      athleteConflicts: athleteConflicts.length,
    };
  });

  if (outcome.kind === "not-found") return { error: tg("errors.notFound") };
  if (outcome.kind === "unknown-location") return { error: tg("errors.locationNotFound") };

  revalidatePath(`/dashboard/group-types/${parsed.data.groupTypeId}`);
  revalidatePath(`/dashboard/schedule`);

  // AC7 — the skipped list, with its reason, surfaced to the admin rather than
  // buried. Partial success reports as success WITH the caveats attached; the
  // sessions that were skipped still need a human.
  const parts = [t("updated"), t("sessionsUpdated", { count: outcome.updated })];
  if (outcome.skippedManual > 0) {
    parts.push(t("skippedManual", { count: outcome.skippedManual }));
  }
  if (outcome.trainerConflicts > 0) {
    parts.push(t("skippedTrainerConflict", { count: outcome.trainerConflicts }));
  }
  if (outcome.athleteConflicts > 0) {
    parts.push(t("skippedAthleteConflict", { count: outcome.athleteConflicts }));
  }
  return { success: parts.join(" ") };
}

/** Today's calendar date in the academy's zone, as `YYYY-MM-DD`. */
function localDateIn(timeZone: string, instant: Date): string {
  // `en-CA` formats as YYYY-MM-DD, which is exactly the shape `generateOccurrences`
  // parses — no reassembly, no locale surprise.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * Deactivate a group type (langlion EPIK 20/AC1, US-21.6, Faza 8).
 *
 * Hard-blocked when active recurrences or future sessions exist (US-21.6/AC1-AC2).
 * The form should pre-check blockers via `checkGroupTypeDeactivation` and display
 * them before the admin attempts deactivation.
 */
export async function deactivateGroupTypeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const groupTypeId = str(formData.get("groupTypeId"));
  const ctx = await requireOrgPermission("group_types.deactivate");
  const t = await getTranslations("groups");

  const actor = await resolveActor(ctx.session);

  try {
    await withTenant(ctx.org.id, (tx) =>
      deactivateGroupType(tx, {
        organizationId: ctx.org.id,
        groupTypeId,
        actor,
      }),
    );

    revalidatePath(`/dashboard/group-types`);
    revalidatePath(`/dashboard/group-types/${groupTypeId}`);
    return { success: t("deactivated") };
  } catch (e) {
    if (e instanceof GroupTypeNotFoundError) return { error: t("errors.notFound") };
    if (e instanceof GroupTypeDeactivationBlockedError) {
      const blocks = e.blocks
        .map((b) => {
          if (b.kind === "has-active-recurrences") return t("hasActiveRecurrences", { count: 0 });
          if (b.kind === "has-future-sessions") return t("hasFutureSessions", { count: b.count });
          return "";
        })
        .filter(Boolean);
      return { error: t("deactivateBlocked") + " " + blocks.join("; ") };
    }
    throw e;
  }
}
