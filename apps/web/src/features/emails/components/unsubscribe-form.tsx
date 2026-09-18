"use client";

import { useState } from "react";

import { Button, FormMessage } from "@/components/ui";
import { clientEnv } from "@/lib/env/client";

const INVALID = "This unsubscribe link is not valid." as const;

/**
 * The confirm button behind the unsubscribe link (spec 10.3) — confirms
 * directly against the main API (faza 3.3: `POST {api}/v1/unsubscribe`,
 * which suppresses by HMAC).
 *
 * A BUTTON, not an automatic action on page load. Mail scanners, corporate
 * link-rewriters and Gmail's image proxy fetch every URL in a message, so an
 * unsubscribe that fired on GET would silently opt out people who never
 * clicked — and the only symptom would be a support ticket asking why the
 * emails stopped.
 *
 * One message for every failure (malformed, forged, muted category alike):
 * none is actionable by the recipient, and distinguishing them only helps
 * someone probing the token format.
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
  const [state, setState] = useState<{ error?: string; done?: boolean }>({});
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      const params = new URLSearchParams({ e, c, t });
      const res = await fetch(
        `${clientEnv.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "")}/v1/unsubscribe?${params.toString()}`,
        { method: "POST" },
      );
      if (!res.ok) {
        setState({ error: INVALID });
        return;
      }
      setState({ done: true });
    } catch {
      setState({ error: INVALID });
    } finally {
      setPending(false);
    }
  }

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
    <div className="flex flex-col gap-4">
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}

      <Button type="button" disabled={pending} onClick={confirm}>
        {pending ? "Unsubscribing…" : "Confirm unsubscribe"}
      </Button>
    </div>
  );
}
