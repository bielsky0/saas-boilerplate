"use client";

import { useState } from "react";

import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui";

/**
 * Allow/Deny for an OAuth authorization request (spec 26 — AI Agent).
 *
 * POSTs the decision to the engine's consent endpoint, which returns the
 * `redirectURI` to send the browser back to the MCP client with (an
 * authorization code on Allow, an `access_denied` error on Deny). A single
 * source of truth: the token is only ever minted by the engine, never here.
 */
const CONSENT_ENDPOINT = "/api/auth/oauth2/consent";

export function ConsentForm({
  consentCode,
  clientId,
  scopes,
}: {
  consentCode: string;
  clientId: string;
  scopes: string[];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(CONSENT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept, consent_code: consentCode }),
      });
      const data = (await res.json().catch(() => null)) as { redirectURI?: string } | null;
      if (!res.ok || !data?.redirectURI) {
        setError("Something went wrong completing this request. Please try again.");
        setPending(false);
        return;
      }
      // Full navigation back to the client's redirect_uri — not the Next router,
      // because the target is off-app (the MCP client's callback).
      window.location.href = data.redirectURI;
    } catch {
      setError("Something went wrong completing this request. Please try again.");
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authorize access</CardTitle>
        <CardDescription>
          <span className="font-medium">{clientId || "An application"}</span> is requesting access
          to your account. It will act on your behalf and can only see and do what you can.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {scopes.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">This will allow it to:</p>
            <ul className="list-disc pl-5 text-sm">
              {scopes.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {error ? <p className="text-destructive mt-4 text-sm">{error}</p> : null}
      </CardContent>
      <CardFooter className="gap-3">
        <Button onClick={() => decide(true)} disabled={pending}>
          Allow
        </Button>
        <Button variant="outline" onClick={() => decide(false)} disabled={pending}>
          Deny
        </Button>
      </CardFooter>
    </Card>
  );
}
