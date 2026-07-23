"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";

import { Button, FormMessage, toast } from "@/components/ui";
import type { FormState } from "@/lib/validation";
import { markAttendanceAction } from "../staff-actions";

const initial: FormState = {};

function MarkButton({
  bookingId,
  status,
  label,
  variant,
}: {
  bookingId: string;
  status: "unmarked" | "present" | "absent";
  label: string;
  variant: "outline" | "secondary" | "ghost";
}) {
  const [state, action, pending] = useActionState(markAttendanceAction, initial);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant={variant} disabled={pending}>
        {label}
      </Button>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
    </form>
  );
}

/**
 * Attendance controls (langlion §2.29, EPIK 31, Faza 6).
 *
 * Three independent forms rather than one select-and-submit: `unmarked` is a
 * real target value (undoing a mark), so each state needs to be reachable in
 * one click, and separate `useActionState` instances keep each button's pending
 * state from disabling the other two.
 */
export function AttendanceControls({
  bookingId,
  current,
}: {
  bookingId: string;
  current: "unmarked" | "present" | "absent";
}) {
  const t = useTranslations("staffPanel");
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <MarkButton
        bookingId={bookingId}
        status="present"
        label={t("actions.markPresent")}
        variant={current === "present" ? "secondary" : "outline"}
      />
      <MarkButton
        bookingId={bookingId}
        status="absent"
        label={t("actions.markAbsent")}
        variant={current === "absent" ? "secondary" : "outline"}
      />
      {current !== "unmarked" ? (
        <MarkButton
          bookingId={bookingId}
          status="unmarked"
          label={t("actions.markUnmarked")}
          variant="ghost"
        />
      ) : null}
    </div>
  );
}
