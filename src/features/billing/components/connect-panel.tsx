"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import type { ConnectAccountStatus } from "@/lib/adapters/billing";
import { SUPPORTED_CONNECT_COUNTRIES } from "@/features/billing/connect-data";

/**
 * Styled native select matching the create-org-form pattern.
 */
function NativeSelect({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "border-input bg-background focus-visible:ring-ring focus-visible:ring-offset-background flex h-9 w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

interface ConnectPanelProps {
  status: ConnectAccountStatus;
  country: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  connectedAt: string | null;
  /** True when ?connect=country_required was in the redirect URL. */
  countryRequired?: boolean;
}

/**
 * Stripe Connect status panel (Faza 10 / EPIK 30).
 *
 * Shows the current Connect status and provides the "Connect Stripe" button.
 * The actual redirect to Stripe happens via GET /api/billing/connect/authorize.
 *
 * Country selection is shown inline when the user was redirected back because
 * country is not set yet.
 */
export function ConnectPanel({
  status,
  country,
  chargesEnabled,
  payoutsEnabled,
  connectedAt,
  countryRequired,
}: ConnectPanelProps) {
  const router = useRouter();
  const [selectedCountry, setSelectedCountry] = useState("");
  const [saving, setSaving] = useState(false);

  const connectStripe = useCallback(() => {
    router.push("/api/billing/connect/authorize");
  }, [router]);

  const saveCountry = useCallback(async () => {
    if (!selectedCountry) return;
    setSaving(true);
    try {
      const res = await fetch("/api/billing/connect/country", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ country: selectedCountry }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save country");
      }
      // Country saved — now start the Connect flow.
      router.push("/api/billing/connect/authorize");
    } catch (err) {
      // Toast/error handling could go here; for now just reset.
      setSaving(false);
    }
  }, [selectedCountry, router]);

  const needsCountry = !country || countryRequired;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Stripe Connect</CardTitle>
          <StatusBadge status={status} />
        </div>
        <p className="text-muted-foreground text-sm">
          {statusText(status, chargesEnabled, payoutsEnabled)}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {needsCountry ? (
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="connect-country" className="text-sm font-medium">
                Country
              </label>
              <NativeSelect
                id="connect-country"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
              >
                <option value="">Select country…</option>
                {SUPPORTED_CONNECT_COUNTRIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button onClick={saveCountry} disabled={!selectedCountry || saving}>
              {saving ? "Saving…" : "Continue"}
            </Button>
          </div>
        ) : null}

        {status === "not_connected" && !needsCountry ? (
          <div>
            <p className="text-muted-foreground mb-3 text-sm">
              Connect your own Stripe account to accept online payments from
              clients. Cash payments at the desk already work without this step.
            </p>
            <Button onClick={connectStripe}>Connect Stripe</Button>
          </div>
        ) : null}

        {status === "onboarding_incomplete" ? (
          <div>
            <p className="text-muted-foreground mb-3 text-sm">
              You started connecting a Stripe account but haven't completed the
              onboarding. Please finish it to accept online payments.
            </p>
            <Button onClick={connectStripe}>Complete onboarding</Button>
          </div>
        ) : null}

        {status === "active" && connectedAt ? (
          <p className="text-muted-foreground text-sm">
            Connected since {new Date(connectedAt).toLocaleDateString()}.
            Online payments are enabled for your clients.
          </p>
        ) : null}

        {status === "restricted" ? (
          <div>
            <p className="text-muted-foreground mb-3 text-sm">
              Your Stripe account requires attention. Some payment features may
              be limited. Please check your Stripe dashboard.
            </p>
            <Button
              variant="outline"
              onClick={() => window.open("https://dashboard.stripe.com", "_blank")}
            >
              Open Stripe Dashboard
            </Button>
          </div>
        ) : null}

        {status === "disabled" ? (
          <p className="text-muted-foreground text-sm">
            Your Stripe account has been disabled. Online payments are not
            available. Please contact Stripe support for details.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ConnectAccountStatus }) {
  switch (status) {
    case "active":
      return <Badge variant="default">Connected</Badge>;
    case "onboarding_incomplete":
      return <Badge variant="outline">Onboarding incomplete</Badge>;
    case "restricted":
      return <Badge variant="warning">Requires attention</Badge>;
    case "disabled":
      return <Badge variant="destructive">Disabled</Badge>;
    case "not_connected":
    default:
      return <Badge variant="outline">Not connected</Badge>;
  }
}

function statusText(
  status: ConnectAccountStatus,
  chargesEnabled: boolean,
  payoutsEnabled: boolean,
): string {
  switch (status) {
    case "active":
      return "Your Stripe account is active and ready to process payments.";
    case "onboarding_incomplete":
      return "Finish setting up your Stripe account to start accepting online payments.";
    case "restricted":
      return chargesEnabled
        ? "Payments are currently restricted. Check your Stripe dashboard."
        : "Charges are disabled. Complete your Stripe account setup.";
    case "disabled":
      return "Your Stripe account has been disabled by Stripe.";
    case "not_connected":
    default:
      return "No Stripe account connected yet. Cash payments at the desk are always available.";
  }
}
