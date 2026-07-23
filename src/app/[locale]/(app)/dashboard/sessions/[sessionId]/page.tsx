import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { requireOrgAccess } from "@/features/organizations/context";
import { hasPermission } from "@/features/rbac";
import { getSession } from "@/features/schedule/data";
import { getGroupType } from "@/features/groups/data";
import { listRosterForSession } from "@/features/bookings/data";
import { AttendanceControls } from "@/features/bookings/components/attendance-controls";
import { CancelBookingButton } from "@/features/bookings/components/cancel-booking-button";
import { ConfirmCashButton } from "@/features/bookings/components/confirm-cash-button";
import { CancelSessionButton } from "@/features/schedule/components/cancel-session-button";
import {
  listGradeFieldsForSessionRoster,
  listGradesForBooking,
  listProgressNotesForBooking,
} from "@/features/grades/data";
import { GradeFieldForm } from "@/features/grades/components/grade-field-form";
import { EnterGradeForm } from "@/features/grades/components/enter-grade-form";
import { ProgressNoteForm } from "@/features/grades/components/progress-note-form";
import { withTenant } from "@/lib/db/tenant";

/**
 * Session roster — the staff panel of langlion §2.29/§2.33 (Faza 6).
 *
 * Visible to every staff role (`requireOrgAccess`, not `requireOrgPermission`):
 * everyone may LOOK at who is booked into a session. Each action is gated
 * individually by `hasPermission`, cosmetically — the backend re-checks and, for
 * attendance/grades, additionally enforces "own sessions only" for a trainer
 * (see `features/bookings/attendance.ts`), which this page cannot express by
 * hiding a button (a trainer sees every roster, only their own is actionable).
 */
export default async function SessionRosterPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const { org, role } = await requireOrgAccess();
  const [t, tg, locale] = await Promise.all([
    getTranslations("staffPanel"),
    getTranslations("grades"),
    getLocale(),
  ]);

  const { session, groupType, roster, gradeFields, gradesByBooking, notesByBooking } =
    await withTenant(org.id, async (tx) => {
      const session = await getSession(tx, org.id, sessionId);
      if (!session) return null;

      const [groupType, roster, gradeFields] = await Promise.all([
        getGroupType(tx, org.id, session.groupTypeId),
        listRosterForSession(tx, org.id, sessionId),
        listGradeFieldsForSessionRoster(tx, org.id, {
          groupTypeId: session.groupTypeId,
          sessionId,
        }),
      ]);

      const gradesByBooking = new Map<string, Map<string, string>>();
      const notesByBooking = new Map<string, { id: string; content: string }[]>();
      for (const row of roster) {
        const [grades, notes] = await Promise.all([
          listGradesForBooking(tx, org.id, row.bookingId),
          listProgressNotesForBooking(tx, org.id, row.bookingId),
        ]);
        gradesByBooking.set(row.bookingId, new Map(grades.map((g) => [g.gradeFieldId, g.value])));
        notesByBooking.set(row.bookingId, notes);
      }

      return { session, groupType, roster, gradeFields, gradesByBooking, notesByBooking };
    }).then((result) => result ?? notFound());

  const formatWhen = new Intl.DateTimeFormat(locale, {
    timeZone: org.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  const canConfirmCash = hasPermission(role, "credits.confirm_on_site");
  const canMarkAttendance = hasPermission(role, "bookings.mark_attendance");
  const canEnterGrades = hasPermission(role, "grades.enter");
  const canManageGradeFields = hasPermission(role, "grade_fields.manage");
  const canCancelBooking = hasPermission(role, "bookings.cancel_reschedule");

  const paymentBadge = (status: string) =>
    status === "confirmed" ? "success" : status === "booked_offline" ? "warning" : "outline";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{groupType?.name ?? t("title")}</h1>
          <p className="text-muted-foreground text-sm">
            {formatWhen.format(session.startTime)} · {org.timezone}
          </p>
        </div>
        {session.status === "scheduled" && hasPermission(role, "sessions.manage") ? (
          <CancelSessionButton sessionId={sessionId} />
        ) : null}
      </div>

      {roster.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.participant")}</TableHead>
              <TableHead>{t("table.payment")}</TableHead>
              <TableHead>{t("table.attendance")}</TableHead>
              {gradeFields.map((field) => (
                <TableHead key={field.id}>{field.name}</TableHead>
              ))}
              <TableHead className="text-right">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roster.map((row) => (
              <TableRow key={row.bookingId}>
                <TableCell className="font-medium">{row.athleteName}</TableCell>
                <TableCell>
                  <Badge variant={paymentBadge(row.paymentStatus)}>
                    {t(`payment.${row.paymentStatus}`)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canMarkAttendance ? (
                    <AttendanceControls bookingId={row.bookingId} current={row.attendanceStatus} />
                  ) : (
                    t(`attendance.${row.attendanceStatus}`)
                  )}
                </TableCell>
                {gradeFields.map((field) => (
                  <TableCell key={field.id}>
                    {canEnterGrades ? (
                      <EnterGradeForm
                        bookingId={row.bookingId}
                        gradeFieldId={field.id}
                        defaultValue={gradesByBooking.get(row.bookingId)?.get(field.id) ?? null}
                        fieldType={field.fieldType}
                        minValue={field.minValue}
                        maxValue={field.maxValue}
                      />
                    ) : (
                      (gradesByBooking.get(row.bookingId)?.get(field.id) ?? "—")
                    )}
                  </TableCell>
                ))}
                <TableCell className="text-right align-top">
                  <div className="flex flex-col items-end gap-2">
                    {canConfirmCash && row.paymentStatus === "booked_offline" ? (
                      <ConfirmCashButton bookingId={row.bookingId} />
                    ) : null}
                    {canCancelBooking && row.paymentStatus !== "cancelled" ? (
                      <CancelBookingButton bookingId={row.bookingId} />
                    ) : null}
                    {canEnterGrades ? (
                      <div className="flex w-64 flex-col gap-1">
                        {(notesByBooking.get(row.bookingId) ?? []).map((note) => (
                          <p key={note.id} className="text-muted-foreground text-xs">
                            {note.content}
                          </p>
                        ))}
                        <ProgressNoteForm bookingId={row.bookingId} />
                      </div>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canManageGradeFields ? (
        <div className="flex flex-col gap-2 border-t pt-6">
          <h2 className="text-lg font-medium">{tg("title")}</h2>
          <p className="text-muted-foreground text-sm">{tg("subtitle")}</p>
          <GradeFieldForm groupTypeId={session.groupTypeId} sessionId={sessionId} />
        </div>
      ) : null}
    </div>
  );
}
