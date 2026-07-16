"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button, FormField, FormMessage, Input } from "@/components/ui";
import { requestPasswordResetAction, type ForgotPasswordState } from "../actions";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  // The confirmation is deliberately identical whether or not the address has an
  // account (spec 2.1). Do not "improve" this into "no account found" — that turns
  // the form into a free account-enumeration oracle.
  if (state.sent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">
          If an account exists for that address, we&apos;ve sent a link to reset your password.
          Check your inbox.
        </p>
        <p className="text-muted-foreground text-sm">
          The link expires in 1 hour.{" "}
          <Link href="/login" className="text-foreground font-medium underline">
            Back to log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormField label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </FormField>

      {state.error ? <FormMessage>{state.error}</FormMessage> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <p className="text-muted-foreground text-sm">
        Remembered it?{" "}
        <Link href="/login" className="text-foreground font-medium underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
