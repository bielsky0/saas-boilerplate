import { NextResponse, type NextRequest } from "next/server";

import { billing } from "@/lib/adapters/billing";
import { processConnectEvent } from "@/features/billing/connect-webhooks";
import { requestLogger } from "@/lib/logger";

/**
 * Stripe Connect webhook endpoint (Faza 10 / EPIK 30).
 *
 * Deliberately UNAUTHENTICATED: Stripe has no session, so the request
 * SIGNATURE is the authentication. Uses a DIFFERENT signing secret than
 * the platform billing webhook (STRIPE_CONNECT_WEBHOOK_SECRET).
 *
 * Events handled:
 *   - account.updated → sync Connect account status
 *   - account.application.deauthorized → reset to not_connected
 *
 * The route is exempted from session checks by the same proxy rule as
 * the platform billing webhook (/api/billing/webhook prefix).
 *
 * Responses mirror the platform billing webhook convention:
 *   400 bad signature / unparseable payload
 *   404 no provider configured
 *   200 accepted, duplicate, ignored, or unknown account
 *   5xx infrastructure failure
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const result = await billing.verifyConnectWebhook(rawBody, request.headers);

  if (!result.ok) {
    if (result.code === "NOT_CONFIGURED") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.code === "MALFORMED_PAYLOAD") {
      (await requestLogger("billing:connect:webhook")).error("rejected malformed payload");
      return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (result.status === "ignored") {
    return NextResponse.json({ received: true, status: "ignored" });
  }

  const processed = await processConnectEvent(result.event);

  return NextResponse.json({ received: true, status: processed.status });
}
