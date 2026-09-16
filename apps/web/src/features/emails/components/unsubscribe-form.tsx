"use client";

import { useActionState } from "react";

import { Button, FormMessage } from "@/components/ui";
import { unsubscribeAction, type UnsubscribeState } from "../actions";

const initialState: UnsubscribeState = {};

/**
 * The confirm button behind the unsubscribe link (spec 10.3).
 *
 * A BUTTON, not an automatic action on page load. Mail scanners, corporate
 * link-rewriters and Gmail's image proxy fetch every URL in a message, so an
 * unsubscribe that fired on GET would silently opt out people who never clicked —
 * and the only symptom would be a support ticket asking why the emails stopped.
 */
export function UnsubscribeForm({
  e,
  c,
  t,
  label,
}: {
  e: string;
  c: string;
  t: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(unsubscribeAction, initialState);

  if (state.done) {
    return (
      <div className="flex flex-col gap-2">
        <FormMessage variant="success">You&apos;ve been unsubscribed.</FormMessage>
        <p className="text-muted-foreground text-sm">
          You won&apos;t receive {label} from us again. Account and security emails — like password
          resets — will still be delivered.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="e" value={e} />
      <input type="hidden" name="c" value={c} />
      <input type="hidden" name="t" value={t} />

      {state.error ? <FormMessage>{state.error}</FormMessage> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Unsubscribing…" : "Confirm unsubscribe"}
      </Button>
    </form>
  );
}
