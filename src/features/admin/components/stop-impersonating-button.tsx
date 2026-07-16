"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { stopImpersonatingAction } from "../actions";

/**
 * Leave admin mode (spec 6.2).
 *
 * A plain server-action form, which is what makes it reachable from ANYWHERE the
 * banner renders — including the 403 page an impersonated session gets if it tries
 * to re-enter /admin. It posts straight to the action and never routes through the
 * (admin) layout, so the escape hatch cannot be gated by the thing you are
 * escaping.
 */
export function StopImpersonatingButton() {
  const [, formAction, pending] = useActionState(async () => {
    await stopImpersonatingAction();
  }, undefined);

  return (
    <form action={formAction}>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Stopping…" : "Stop impersonating"}
      </Button>
    </form>
  );
}
