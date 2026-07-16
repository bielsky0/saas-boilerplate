"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button, FormField, FormMessage, Input } from "@/components/ui";
import { signInAction, type FormState } from "../actions";

const initialState: FormState = {};

export function SignInForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <FormField label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </FormField>
      <FormField label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <p className="text-xs">
          <Link href="/forgot-password" className="text-muted-foreground underline">
            Forgot your password?
          </Link>
        </p>
      </FormField>

      {state.error ? <FormMessage>{state.error}</FormMessage> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Log in"}
      </Button>

      <p className="text-muted-foreground text-sm">
        Need an account?{" "}
        <Link href="/signup" className="text-foreground font-medium underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}
