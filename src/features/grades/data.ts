import { and, eq } from "drizzle-orm";

import { grade, gradeField, progressNote } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * E-dziennik data access (langlion §2.33, EPIK 35, v16, Faza 6).
 *
 * Same conventions as every other langlion DAL: a `TenantDb` handle, and an
 * explicit `organizationId` filter that RLS backs up rather than replaces.
 */

/** Fields configured for every session of one offer. */
export async function listGradeFieldsForGroupType(
  tx: TenantDb,
  organizationId: string,
  groupTypeId: string,
) {
  return tx
    .select()
    .from(gradeField)
    .where(
      and(eq(gradeField.organizationId, organizationId), eq(gradeField.groupTypeId, groupTypeId)),
    );
}

/** Ad-hoc fields defined on one specific session. */
export async function listGradeFieldsForSession(
  tx: TenantDb,
  organizationId: string,
  sessionId: string,
) {
  return tx
    .select()
    .from(gradeField)
    .where(and(eq(gradeField.organizationId, organizationId), eq(gradeField.sessionId, sessionId)));
}

/** Every field applicable to a session: its group type's, plus its own ad-hoc ones. */
export async function listGradeFieldsForSessionRoster(
  tx: TenantDb,
  organizationId: string,
  params: { groupTypeId: string; sessionId: string },
) {
  const [groupTypeFields, sessionFields] = await Promise.all([
    listGradeFieldsForGroupType(tx, organizationId, params.groupTypeId),
    listGradeFieldsForSession(tx, organizationId, params.sessionId),
  ]);
  return [...groupTypeFields, ...sessionFields];
}

export async function getGradeField(tx: TenantDb, organizationId: string, id: string) {
  const [row] = await tx
    .select()
    .from(gradeField)
    .where(and(eq(gradeField.id, id), eq(gradeField.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

/** All grades entered for one booking, keyed by field. */
export async function listGradesForBooking(tx: TenantDb, organizationId: string, bookingId: string) {
  return tx
    .select()
    .from(grade)
    .where(and(eq(grade.organizationId, organizationId), eq(grade.bookingId, bookingId)));
}

/** The one grade a booking has for a given field, or null (see `grade_field_booking_uq`). */
export async function getGradeForBookingField(
  tx: TenantDb,
  organizationId: string,
  params: { bookingId: string; gradeFieldId: string },
) {
  const [row] = await tx
    .select()
    .from(grade)
    .where(
      and(
        eq(grade.organizationId, organizationId),
        eq(grade.bookingId, params.bookingId),
        eq(grade.gradeFieldId, params.gradeFieldId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Every note about one booking, a running log rather than one current value. */
export async function listProgressNotesForBooking(
  tx: TenantDb,
  organizationId: string,
  bookingId: string,
) {
  return tx
    .select()
    .from(progressNote)
    .where(and(eq(progressNote.organizationId, organizationId), eq(progressNote.bookingId, bookingId)));
}
