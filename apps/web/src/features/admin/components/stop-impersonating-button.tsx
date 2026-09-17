"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui";
import { stopImpersonatingViaWeb } from "../client";

/**
 * Leave admin mode (spec 6.2) through the same-origin relay (faza 2.6).
 *
 * A plain client button, which is what makes it reachable from ANYWHERE the
 * banner renders — including the 403 page an impersonated session gets if it
 * tries to re-enter /admin. It posts to the relay route and never through the
 * (admin) layout, so the escape hatch cannot be gated by the thing you are
 * escaping. When the API fell back to a plain sign-out (the admin's own
 * session expired mid-impersonation), there is no admin session to return to
 * and the landing is `/login`.
 */
export function StopImpersonatingButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleStop() {
    setPending(true);
    try {
      const result = await stopImpersonatingViaWeb();
      if (!result.ok) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      router.push(result.data.signedOut ? "/login" : "/dashboard");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => void handleStop()}
    >
      {pending ? "Stopping…" : "Stop impersonating"}
    </Button>
  );
}
