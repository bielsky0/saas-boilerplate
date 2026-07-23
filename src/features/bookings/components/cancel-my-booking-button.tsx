"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui";
import { cancelMyBookingAction } from "../client-actions";

/**
 * Cancel a booking from the client's self-service panel (F7 D6, US-12.1).
 *
 * 24h rule is enforced on the server — the button is always rendered, but the
 * server action will reject bookings within 24h of the session start.
 */
export function CancelMyBookingButton({ bookingId }: { bookingId: string }) {
  const t = useTranslations("enrollment");
  const [state, action, pending] = useActionState(cancelMyBookingAction, {});

  return (
    <form action={action}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? t("cancelling") : t("cancel")}
      </Button>
      {state?.success ? <p className="text-xs text-green-600">{state.success}</p> : null}
      {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}
