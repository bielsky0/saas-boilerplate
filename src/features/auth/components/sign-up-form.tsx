"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button, FormField, Input } from "@/components/ui";
import { signUpAction, type FormState } from "../actions";

const initialState: FormState = {};

export function SignUpForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <FormField label="Name (optional)" htmlFor="name">
        <Input id="name" name="name" type="text" autoComplete="name" />
      </FormField>
      <FormField label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </FormField>
      <FormField label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <p className="text-xs text-black/60 dark:text-white/60">
          At least 8 characters, including a letter and a number.
        </p>
      </FormField>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-sm text-black/60 dark:text-white/60">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
