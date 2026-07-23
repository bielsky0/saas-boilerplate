import { and, eq } from "drizzle-orm";

import { recordAudit, type AuditActor } from "@/features/admin/audit";
import { enqueueEmail } from "@/features/emails/send";
import type { Locale } from "@/lib/i18n";
import { athlete, booking, classSession, client, grade, progressNote } from "@/lib/db/schema";
import type { Role } from "@/features/rbac";
import type { TenantDb } from "@/lib/db/tenant";
import { getGradeField } from "./data";

/**
 * Entering grades and progress notes (langlion §2.33, EPIK 35, v16, Faza 6).
 *
 * "OWN SESSIONS ONLY" FOR A TRAINER, same enforcement shape as
 * `features/bookings/attendance.ts`: compare `classSession.trainerId` to the
 * caller, here rather than in the RBAC map (§2.10 grants `grades.enter`
 * generically, "own" is not expressible there).
 *
 * E-MAIL, NOT IN-APP NOTIFICATION, per plan Faza 6 (Rozstrzygnięcie #3): the
 * client panel does not show grades/notes yet (F13 retrofit, US-35.6), and the
 * in-app Notification Center event catalog does not exist yet either (F14). Both
 * functions queue the email in the SAME transaction as the write (Rule A) via
 * `enqueueEmail`, so a rolled-back entry never sends a mail about itself.
 */

export class BookingNotFoundError extends Error {}
export class GradeFieldNotFoundError extends Error {}
/** A trainer tried to act on a session that is not theirs. */
export class ForeignSessionError extends Error {}

interface ParticipantContext {
  athleteName: string;
  clientEmail: string;
  sessionId: string;
}

async function loadBookingAndAssertOwnership(
  tx: TenantDb,
  organizationId: string,
  bookingId: string,
  guard: { callerRole: Role; actingUserId: string },
): Promise<ParticipantContext> {
  const [row] = await tx
    .select({
      sessionId: booking.sessionId,
      athleteId: booking.athleteId,
      athleteName: athlete.name,
      parentClientId: athlete.parentClientId,
    })
    .from(booking)
    .innerJoin(
      athlete,
      and(eq(athlete.id, booking.athleteId), eq(athlete.organizationId, booking.organizationId)),
    )
    .where(and(eq(booking.id, bookingId), eq(booking.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new BookingNotFoundError(bookingId);

  const [session] = await tx
    .select({ trainerId: classSession.trainerId })
    .from(classSession)
    .where(and(eq(classSession.id, row.sessionId), eq(classSession.organizationId, organizationId)))
    .limit(1);
  if (!session) throw new BookingNotFoundError(bookingId);

  if (guard.callerRole === "trainer" && session.trainerId !== guard.actingUserId) {
    throw new ForeignSessionError(row.sessionId);
  }

  const [parent] = await tx
    .select({ email: client.email })
    .from(client)
    .where(and(eq(client.id, row.parentClientId), eq(client.organizationId, organizationId)))
    .limit(1);
  if (!parent) throw new BookingNotFoundError(bookingId);

  return { athleteName: row.athleteName, clientEmail: parent.email, sessionId: row.sessionId };
}

export interface EnterGradeInput {
  organizationId: string;
  organizationName: string;
  gradeFieldId: string;
  bookingId: string;
  value: string;
  enteredByUserId: string;
  callerRole: Role;
  actor: AuditActor;
  locale: Locale;
  now?: Date;
}

export async function enterGrade(
  tx: TenantDb,
  input: EnterGradeInput,
): Promise<{ previousValue: string | null; sessionId: string }> {
  const now = input.now ?? new Date();

  const field = await getGradeField(tx, input.organizationId, input.gradeFieldId);
  if (!field) throw new GradeFieldNotFoundError(input.gradeFieldId);

  const participant = await loadBookingAndAssertOwnership(
    tx,
    input.organizationId,
    input.bookingId,
    { callerRole: input.callerRole, actingUserId: input.enteredByUserId },
  );

  const [existing] = await tx
    .select({ id: grade.id, value: grade.value })
    .from(grade)
    .where(
      and(
        eq(grade.organizationId, input.organizationId),
        eq(grade.gradeFieldId, input.gradeFieldId),
        eq(grade.bookingId, input.bookingId),
      ),
    )
    .limit(1)
    .for("update");

  const previousValue = existing?.value ?? null;

  if (existing) {
    await tx
      .update(grade)
      .set({ value: input.value, enteredByUserId: input.enteredByUserId, updatedAt: now })
      .where(and(eq(grade.id, existing.id), eq(grade.organizationId, input.organizationId)));
  } else {
    await tx.insert(grade).values({
      organizationId: input.organizationId,
      gradeFieldId: input.gradeFieldId,
      bookingId: input.bookingId,
      value: input.value,
      enteredByUserId: input.enteredByUserId,
    });
  }

  await recordAudit(tx, {
    action: "grade.enter",
    actor: input.actor,
    organizationId: input.organizationId,
    targetType: "grade",
    targetId: input.bookingId,
    targetLabel: `${field.name} — ${participant.athleteName}`,
    metadata: {
      gradeFieldId: input.gradeFieldId,
      bookingId: input.bookingId,
      previous: previousValue,
      next: input.value,
    },
  });

  await enqueueEmail(
    tx,
    "grade-recorded",
    { orgName: input.organizationName, athleteName: participant.athleteName, fieldName: field.name },
    { to: participant.clientEmail, locale: input.locale },
    // Keyed on booking+field+value so a genuine re-entry (a different value) is a
    // new message, matching `enterGrade`'s own "overwrite" semantics rather than
    // the queue swallowing a correction as a duplicate of the first entry.
    { dedupeKey: `grade-recorded:${input.bookingId}:${input.gradeFieldId}:${input.value}` },
  );

  return { previousValue, sessionId: participant.sessionId };
}

export interface AddProgressNoteInput {
  organizationId: string;
  organizationName: string;
  bookingId: string;
  content: string;
  enteredByUserId: string;
  callerRole: Role;
  actor: AuditActor;
  locale: Locale;
}

export async function addProgressNote(
  tx: TenantDb,
  input: AddProgressNoteInput,
): Promise<{ id: string; sessionId: string }> {
  const participant = await loadBookingAndAssertOwnership(
    tx,
    input.organizationId,
    input.bookingId,
    { callerRole: input.callerRole, actingUserId: input.enteredByUserId },
  );

  const [row] = await tx
    .insert(progressNote)
    .values({
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      content: input.content,
      enteredByUserId: input.enteredByUserId,
    })
    .returning({ id: progressNote.id });
  if (!row) throw new Error("addProgressNote: insert returned no row");

  await recordAudit(tx, {
    action: "progress_note.create",
    actor: input.actor,
    organizationId: input.organizationId,
    targetType: "progress_note",
    targetId: row.id,
    targetLabel: participant.athleteName,
    metadata: { bookingId: input.bookingId },
  });

  await enqueueEmail(
    tx,
    "progress-note-added",
    { orgName: input.organizationName, athleteName: participant.athleteName },
    { to: participant.clientEmail, locale: input.locale },
    { dedupeKey: `progress-note-added:${row.id}` },
  );

  return { id: row.id, sessionId: participant.sessionId };
}
