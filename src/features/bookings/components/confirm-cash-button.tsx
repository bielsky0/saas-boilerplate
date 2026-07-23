"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";

import { Button, FormMessage, toast } from "@/components/ui";
import type { FormState } from "@/lib/validation";
import { confirmCashPaymentAction } from "../staff-actions";

const initial: FormState = {};

/** "Confirm cash" — one row's action, langlion §2.29/US-6.1, Faza 6. */
export function ConfirmCashButton({ bookingId }: { bookingId: string }) {
  const t = useTranslations("staffPanel");
  const [state, action, pending] = useActionState(confirmCashPaymentAction, initial);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" size="sm" disabled={pending}>
        {t("actions.confirmCash")}
      </Button>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
    </form>
  );
}
