"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui";
import { cancelBookingAction } from "../staff-actions";

/**
 * Cancel a booking from the staff roster (F7 D4, US-12.2).
 *
 * Gated by `bookings.cancel_reschedule` on the server — this button is only
 * rendered when the caller has that permission.
 */
export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const t = useTranslations("staffPanel");
  const [state, action, pending] = useActionState(cancelBookingAction, {});

  return (
    <form action={action}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? t("cancelling") : t("cancelBooking")}
      </Button>
      {state?.success ? <p className="text-xs text-green-600">{state.success}</p> : null}
      {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}
