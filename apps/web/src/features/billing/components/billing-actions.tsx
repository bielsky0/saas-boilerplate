"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui";
import { clientEnv } from "@/lib/env/client";
import type { PlanId } from "../plans";

/**
 * Checkout / portal buttons (spec 5.3, 5.5, faza 3.2).
 *
 * The endpoints answer with a URL rather than a 3xx, and this component performs the
 * navigation. A redirect would be followed opaquely by `fetch`, leaving no way to
 * tell a provider outage from a success — the user would land back on the same
 * page with no explanation. Here a non-2xx becomes a toast.
 *
 * Calls go DIRECTLY to the main API (`NEXT_PUBLIC_API_BASE_URL + /v1/billing/*`,
 * `credentials: "include"`) — same shape and status codes the thin `app/api`
 * relays used to pass through, so error mapping below is unchanged. No web
 * route is involved: `window.location.assign` leaves the Next origin for the
 * provider anyway.
 *
 * `window.location.assign` (not `location.href =`) because the repo's
 * `react-hooks/immutability` rule rejects assigning to a browser global.
 */

function apiBase(): string {
  return clientEnv.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "");
}

async function openProviderUrl(
  path: "/v1/billing/checkout" | "/v1/billing/portal",
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; status: number }> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const { url } = (await res.json()) as { url: string };
  window.location.assign(url);
  return { ok: true };
}

export function CheckoutButton({
  slug,
  plan,
  label,
  variant = "default",
}: {
  slug: string | null;
  plan: PlanId;
  label: string;
  variant?: "default" | "outline";
}) {
  const t = useTranslations("billing");
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant={variant}
      className="w-full"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void openProviderUrl("/v1/billing/checkout", { slug, plan }).then((result) => {
          if (result.ok) return; // Navigating away; leave the button disabled.
          setPending(false);
          // 404 here means this deployment has no payment provider configured,
          // which is a different message from the provider being down.
          toast.error(result.status === 404 ? t("notConfigured") : t("providerError"));
        });
      }}
    >
      {label}
    </Button>
  );
}

export function PortalButton({ slug }: { slug: string | null }) {
  const t = useTranslations("billing");
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void openProviderUrl("/v1/billing/portal", { slug }).then((result) => {
          if (result.ok) return;
          setPending(false);
          toast.error(result.status === 404 ? t("noPortal") : t("providerError"));
        });
      }}
    >
      {t("managePortal")}
    </Button>
  );
}
