"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui";
import { signOutFromNest } from "../client";

/**
 * Sign-out control. Calls Nest directly so the expired session cookie lands
 * on the browser response — a server-to-server call could never relay it.
 */
export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      await signOutFromNest();
    } finally {
      // Whatever happened, the session is over client-side: land on login.
      window.location.assign("/login");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Button type="submit" variant="ghost" disabled={pending}>
        Sign out
      </Button>
    </form>
  );
}
