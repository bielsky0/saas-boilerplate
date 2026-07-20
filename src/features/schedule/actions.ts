"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { changed, recordAudit, resolveActor, withImpersonation } from "@/features/admin/audit";
import { requireOrgPermission } from "@/features/organizations/context";
import { classSession, location } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { SQLSTATE_EXCLUSION_VIOLATION, sqlStateOf } from "@/lib/db/sql-error";
import type { FormState } from "@/lib/validation";
import { zonedWallClockToUtc } from "./recurrence";
import { updateSessionSchema } from "./schema";

/**
 * Per-session edits (langlion §3.4/AC9, US-22.3, US-14.4).
 *
 * The Realisation half. An admin reaches for this when one date needs to differ
 * from its pattern: the hall is double-booked that week, or one more child has to
 * fit. Three fields, and each is a different user story.
 *
 * WHAT SETTING `isManuallyAdjusted` MEANS. Editing the time or the location marks
 * the row, so a later bulk update from the pattern skips it (§3.4/AC8) — that is
 * the flag's entire purpose: it records "a human decided this specific date is
 * different", so that a subsequent season-wide edit cannot silently undo them.
 *
 * CAPACITY DOES NOT SET IT, and the asymmetry is deliberate. Raising capacity is
 * the one legitimate way to admit an extra participant to a full session
 * (US-14.4/AC1), and it says nothing about when or where the class happens — so
 * a pattern edit that moves the season should still move this session. Marking it
 * would quietly exclude the row from future schedule changes as a side effect of
 * an unrelated decision.
 *
 * There is NO capacity override anywhere in this file, and none exists in the
 * system: raising the number is the legitimate path, and no role may exceed the
 * number that is there (US-14.2/AC3, US-14.5/AC2).
 */

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/**
 * Resolve a `datetime-local` value (`YYYY-MM-DDTHH:mm`) to the instant it names
 * in `timeZone`.
 *
 * Delegates to `recurrence.ts` rather than reimplementing the conversion: its
 * two-pass offset probe is what makes wall-clock times correct on both sides of a
 * DST boundary, and a second implementation here would be the one that drifts.
 * Returns the raw string unchanged when it does not match, letting zod produce
 * the field error instead of this function inventing one.
 */
function wallClockToInstant(value: string, timeZone: string): Date | string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  return zonedWallClockToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    timeZone,
  );
}

export async function updateSessionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const slug = str(formData.get("slug"));
  const sessionId = str(formData.get("sessionId"));
  const ctx = await requireOrgPermission(slug, "sessions.manage");
  const [t, tv] = await Promise.all([
    getTranslations("schedule"),
    getTranslations("schedule.validation"),
  ]);

  const rawStart = str(formData.get("startTime"));
  const rawEnd = str(formData.get("endTime"));
  const rawLocation = str(formData.get("locationId"));
  const rawCapacity = str(formData.get("capacity"));

  const parsed = updateSessionSchema(tv).safeParse({
    // Converted HERE, not by `z.coerce.date()`. The form posts a naive wall clock
    // ("2026-08-13T18:00") because `datetime-local` carries no zone, and
    // `new Date()` on such a string resolves it in the SERVER's zone — which is
    // UTC on Vercel and something else on a laptop. The academy's zone is the
    // only correct reading, and getting this wrong is silent: every session lands
    // an offset away, consistently enough to look deliberate.
    startTime: rawStart ? wallClockToInstant(rawStart, ctx.org.timezone) : undefined,
    endTime: rawEnd ? wallClockToInstant(rawEnd, ctx.org.timezone) : undefined,
    // Distinguishes "clear the location" (empty string posted) from "leave it
    // alone" (field absent) — `nullish` in the schema accepts both, and the two
    // mean different things to an admin who deliberately blanked the field.
    locationId: formData.has("locationId") ? rawLocation || null : undefined,
    capacity: rawCapacity || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("errors.generic") };
  }

  const actor = await resolveActor(ctx.session);
  const movedInTimeOrSpace =
    parsed.data.startTime !== undefined || parsed.data.locationId !== undefined;

  let outcome: "ok" | "not-found" | "trainer-conflict";
  try {
    outcome = await withTenant(ctx.org.id, async (tx) => {
      // FOR UPDATE, same lock the pattern edit takes (§3.4/AC6) and the same one
      // booking creation will take in F5. One row, one queue — an admin moving a
      // session and a parent booking it serialise rather than interleave.
      const [before] = await tx
        .select()
        .from(classSession)
        .where(and(eq(classSession.id, sessionId), eq(classSession.organizationId, ctx.org.id)))
        .limit(1)
        .for("update");
      if (!before) return "not-found" as const;

      if (parsed.data.locationId) {
        const [row] = await tx
          .select({ id: location.id })
          .from(location)
          .where(
            and(eq(location.id, parsed.data.locationId), eq(location.organizationId, ctx.org.id)),
          )
          .limit(1);
        if (!row) return "not-found" as const;
      }

      const after = {
        startTime: parsed.data.startTime ?? before.startTime,
        endTime: parsed.data.endTime ?? before.endTime,
        locationId:
          parsed.data.locationId === undefined ? before.locationId : parsed.data.locationId,
        capacity: parsed.data.capacity ?? before.capacity,
        // AC9. OR-ed rather than assigned: once a session has been hand-adjusted
        // it stays that way, so a later capacity-only edit cannot clear the mark
        // and re-expose the row to bulk pattern updates.
        isManuallyAdjusted: before.isManuallyAdjusted || movedInTimeOrSpace,
      };

      // The denormalised times on any bookings for this session are maintained by
      // the composite FK's ON UPDATE CASCADE (decyzja D4) — not by code here.
      // US-14.3/AC3 is satisfied structurally; a manual UPDATE would be dead code.
      await tx
        .update(classSession)
        .set({ ...after, updatedAt: new Date() })
        .where(and(eq(classSession.id, sessionId), eq(classSession.organizationId, ctx.org.id)));

      await recordAudit(tx, {
        actor,
        organizationId: ctx.org.id,
        action: "class_session.update",
        targetType: "class_session",
        targetId: sessionId,
        targetLabel: before.startTime.toISOString(),
        metadata: withImpersonation(ctx.session, {
          changes: changed(before, after, [
            "startTime",
            "endTime",
            "locationId",
            "capacity",
            "isManuallyAdjusted",
          ]),
        }),
      });

      return "ok" as const;
    });
  } catch (error) {
    // §5.1 — the trainer is busy at the new time. A hard block: Force Override
    // (F18) is the only thing that will ever be allowed past this, and it does
    // not exist yet, so there is deliberately no bypass to reach for here.
    if (sqlStateOf(error) === SQLSTATE_EXCLUSION_VIOLATION) {
      return { error: t("errors.trainerConflict") };
    }
    throw error;
  }

  if (outcome === "not-found") return { error: t("errors.notFound") };

  revalidatePath(`/orgs/${slug}/schedule`);
  return { success: t("updated") };
}
