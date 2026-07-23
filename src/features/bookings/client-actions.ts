"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { clientActor } from "@/features/admin/audit";
import { resolveClientSession } from "@/features/client-auth/session";
import { requireServedOrganization } from "@/features/organizations/served-org";
import { withTenant } from "@/lib/db/tenant";
import type { FormState } from "@/lib/validation";
import {
  BookingAlreadyCancelledError,
  BookingNotFoundError,
  CancellationTooLateError,
  cancelBooking,
} from "./cancel";
import {
  AthleteNotOwnedError,
  NoCreditsAvailableError,
  SessionFullError,
  SessionNotScheduledError,
  SessionPastError,
  dopisanieBooking,
} from "./credit-booking";
import { getActiveBookingsForClient } from "./data";

/**
 * Client-facing server actions (langlion F7 D6/D7).
 *
 * Gated by OTP session (`resolveClientSession`), NOT by RBAC — these are actions
 * a parent performs on their own bookings.
 */

export type ClientBookingState = FormState & { bookingId?: string };

/**
 * Cancel one of the client's own bookings (US-12.1, 24h rule enforced).
 */
export async function cancelMyBookingAction(
  _prev: ClientBookingState,
  formData: FormData,
): Promise<ClientBookingState> {
  const org = await requireServedOrganization();
  const t = await getTranslations("staffPanel");

  const principal = await resolveClientSession(org.id);
  if (!principal || !principal.isVerified) {
    return { error: t("errors.verifyFirst") };
  }

  const bookingId = formData.get("bookingId");
  if (typeof bookingId !== "string" || !bookingId) {
    return { error: t("errors.generic") };
  }

  try {
    const result = await withTenant(org.id, async (tx) => {
      // Verify this booking belongs to one of the client's athletes.
      const bookings = await getActiveBookingsForClient(tx, org.id, principal.clientId);
      const owns = bookings.some((b) => b.bookingId === bookingId);
      if (!owns) throw new BookingNotFoundError();

      return cancelBooking(tx, {
        organizationId: org.id,
        bookingId,
        timeZone: org.timezone,
        actor: clientActor(principal.email),
        bypass24h: false,
      });
    });

    revalidatePath(`/moje-zajecia`);
    return { success: t("bookingCancelled"), bookingId: result.athleteId };
  } catch (error) {
    if (error instanceof BookingNotFoundError) return { error: t("errors.bookingNotFound") };
    if (error instanceof BookingAlreadyCancelledError) return { error: t("errors.bookingNotFound") };
    if (error instanceof CancellationTooLateError) return { error: t("errors.tooLate") };
    throw error;
  }
}

/**
 * Add an extra session using an existing credit (Dopisanie — EPIK 8, Odrabianie — EPIK 13).
 *
 * Consumes an available credit FIFO for the given group type. If consumed credit
 * has `source = "cancellation"`, it's recorded as a make-up; otherwise as an extra session.
 */
export async function addExtraSessionAction(
  _prev: ClientBookingState,
  formData: FormData,
): Promise<ClientBookingState> {
  const org = await requireServedOrganization();
  const t = await getTranslations("enrollment");

  const principal = await resolveClientSession(org.id);
  if (!principal || !principal.isVerified) {
    return { error: t("errors.verifyFirst") };
  }

  const sessionId = formData.get("sessionId");
  const groupTypeId = formData.get("groupTypeId");
  const athleteId = formData.get("athleteId");

  if (typeof sessionId !== "string" || typeof groupTypeId !== "string" || typeof athleteId !== "string") {
    return { error: t("errors.generic") };
  }

  try {
    const result = await withTenant(org.id, (tx) =>
      dopisanieBooking(tx, {
        organizationId: org.id,
        sessionId,
        groupTypeId,
        clientId: principal.clientId,
        athleteId,
        currency: org.currency,
        actor: clientActor(principal.email),
      }),
    );

    revalidatePath(`/moje-zajecia`);
    return {
      success: result.bookingType === "makeup" ? t("makeupBooked") : t("extraBooked"),
      bookingId: result.bookingId,
    };
  } catch (error) {
    if (error instanceof NoCreditsAvailableError) return { error: t("errors.noCredits") };
    if (error instanceof SessionFullError) return { error: t("errors.sessionFull") };
    if (error instanceof SessionNotScheduledError || error instanceof SessionPastError) {
      return { error: t("errors.sessionCancelled") };
    }
    if (error instanceof AthleteNotOwnedError) return { error: t("errors.foreignAthlete") };
    throw error;
  }
}
