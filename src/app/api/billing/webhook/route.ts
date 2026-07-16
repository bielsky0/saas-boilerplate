import { NextResponse, type NextRequest } from "next/server";

import { processBillingEvent } from "@/features/billing/webhooks";
import { billing } from "@/lib/adapters/billing";

/**
 * Billing webhook endpoint (spec 5.4 — the source of truth for subscriptions).
 *
 * Deliberately UNAUTHENTICATED: the provider has no session, so the request
 * SIGNATURE is the authentication. It is therefore exempted in `src/proxy.ts`;
 * without that exemption the route guard would answer 307 to /login, and
 * providers do not follow redirects.
 *
 * The body is read with `request.text()` because signatures are computed over
 * the exact bytes sent — re-serializing via `request.json()` would invalidate
 * them. App Router route handlers stream the body, so no bodyParser config is
 * needed (Next.js docs, Route Handlers → Webhooks).
 *
 * Responses are chosen by whether a retry could ever help, since the provider
 * retries on ANY non-2xx:
 *   400 bad signature / unparseable payload — not actionable, or a bug to fix
 *   404 no provider configured — this deployment has no billing endpoint
 *   200 accepted, duplicate, ignored, or not our customer — all final
 *   5xx (uncaught) infrastructure failure — retry is exactly right
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const result = await billing.verifyWebhook(rawBody, request.headers);

  if (!result.ok) {
    if (result.code === "NOT_CONFIGURED") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.code === "MALFORMED_PAYLOAD") {
      // Authentic but unrecognizable — usually provider API-version skew.
      // Retries give us a window to deploy a fix and have them redelivered.
      console.error("[billing:webhook] rejected malformed payload");
      return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (result.status === "ignored") {
    // Most provider traffic. Never touches state, so no marker is written.
    return NextResponse.json({ received: true, status: "ignored" });
  }

  // Infrastructure errors propagate to a 500 on purpose (see header).
  const processed = await processBillingEvent(result.event);
  return NextResponse.json({ received: true, status: processed.status });
}
