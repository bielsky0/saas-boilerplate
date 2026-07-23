"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { resolveActor } from "@/features/admin/audit";
import { requireOrgPermission } from "@/features/organizations/context";
import { withTenant } from "@/lib/db/tenant";
import type { FormState } from "@/lib/validation";
import {
  BookingAlreadyCancelledError,
  BookingNotFoundError as CancelBookingNotFoundError,
  CancellationTooLateError,
  cancelBooking,
} from "./cancel";
import {
  BookingNotConfirmableError,
  BookingNotFoundError as ConfirmCashBookingNotFoundError,
  confirmCashPayment,
  NoCreditTypeError,
} from "./confirm-cash";
import {
  BookingNotFoundError as AttendanceBookingNotFoundError,
  ForeignSessionError,
  markAttendance,
} from "./attendance";

/**
 * Staff server actions on an existing booking (langlion §2.29, §6.1, Faza 6).
 *
 * Distinct from `actions.ts` (the public enrollment submission, called by an
 * unauthenticated parent): every action here is `requireOrgPermission`-gated
 * staff panel code, following the same conventions as
 * `features/credits/actions.ts` (`resolveActor` before the transaction opens,
 * audit row inside the same `tx` as the write).
 */

export async function confirmCashPaymentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrgPermission("credits.confirm_on_site");
  const t = await getTranslations("staffPanel");
  const bookingId = str(formData.get("bookingId"));
  if (!bookingId) return { error: t("errors.generic") };

  const actor = await resolveActor(ctx.session);

  let sessionId: string;
  try {
    ({ sessionId } = await withTenant(ctx.org.id, (tx) =>
      confirmCashPayment(tx, {
        organizationId: ctx.org.id,
        bookingId,
        timeZone: ctx.org.timezone,
        actor,
      }),
    ));
  } catch (error) {
    if (error instanceof ConfirmCashBookingNotFoundError) return { error: t("errors.bookingNotFound") };
    if (error instanceof BookingNotConfirmableError) return { error: t("errors.notConfirmable") };
    if (error instanceof NoCreditTypeError) return { error: t("errors.noCreditType") };
    throw error;
  }

  revalidatePath(`/dashboard/sessions/${sessionId}`);
  return { success: t("cashConfirmed") };
}

export async function markAttendanceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrgPermission("bookings.mark_attendance");
  const t = await getTranslations("staffPanel");
  const bookingId = str(formData.get("bookingId"));
  const status = str(formData.get("status"));
  if (!bookingId || (status !== "unmarked" && status !== "present" && status !== "absent")) {
    return { error: t("errors.generic") };
  }

  const actor = await resolveActor(ctx.session);

  let sessionId: string;
  try {
    ({ sessionId } = await withTenant(ctx.org.id, (tx) =>
      markAttendance(tx, {
        organizationId: ctx.org.id,
        bookingId,
        status,
        markedByUserId: ctx.session.user.id,
        callerRole: ctx.role,
        actor,
      }),
    ));
  } catch (error) {
    if (error instanceof AttendanceBookingNotFoundError) return { error: t("errors.bookingNotFound") };
    if (error instanceof ForeignSessionError) return { error: t("errors.foreignSession") };
    throw error;
  }

  revalidatePath(`/dashboard/sessions/${sessionId}`);
  return { success: t("attendanceMarked") };
}

export async function cancelBookingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrgPermission("bookings.cancel_reschedule");
  const t = await getTranslations("staffPanel");
  const bookingId = str(formData.get("bookingId"));
  if (!bookingId) return { error: t("errors.generic") };

  const actor = await resolveActor(ctx.session);

  try {
    await withTenant(ctx.org.id, (tx) =>
      cancelBooking(tx, {
        organizationId: ctx.org.id,
        bookingId,
        timeZone: ctx.org.timezone,
        actor,
        bypass24h: true,
      }),
    );
  } catch (error) {
    if (error instanceof CancelBookingNotFoundError) return { error: t("errors.bookingNotFound") };
    if (error instanceof BookingAlreadyCancelledError) return { error: t("errors.bookingNotFound") };
    if (error instanceof CancellationTooLateError) return { error: t("errors.generic") };
    throw error;
  }

  revalidatePath(`/dashboard/sessions`);
  return { success: t("bookingCancelled") };
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
