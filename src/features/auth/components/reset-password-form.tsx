"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button, FormField, FormMessage, Input } from "@/components/ui";
import { resetPasswordAction, type ResetPasswordState } from "../actions";

const initialState: ResetPasswordState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormField label="New password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <p className="text-muted-foreground text-xs">
          At least 8 characters, including a letter and a number.
        </p>
      </FormField>

      {state.error ? <FormMessage>{state.error}</FormMessage> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>

      <p className="text-muted-foreground text-sm">
        Setting a new password signs you out everywhere else.{" "}
        <Link href="/login" className="text-foreground font-medium underline">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
