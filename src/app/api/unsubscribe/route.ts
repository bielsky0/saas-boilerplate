import { NextResponse, type NextRequest } from "next/server";

import { suppress } from "@/features/emails/data";
import { verifyUnsubscribeToken } from "@/features/emails/suppression";

/**
 * RFC 8058 one-click unsubscribe (spec 10.3).
 *
 * The target of the `List-Unsubscribe` header. Mail clients (Gmail, Outlook) POST
 * `List-Unsubscribe=One-Click` here as form data when the user clicks the
 * unsubscribe affordance the CLIENT renders, next to the sender name — never
 * inside the message body.
 *
 * POST ONLY, and that is the specification's whole point: a GET is issued by
 * scanners and prefetchers and means nothing, whereas a POST from a mail
 * provider's servers is a deliberate act by the user. So this one suppresses
 * immediately with no confirmation page, unlike the in-body link at /unsubscribe.
 *
 * Unauthenticated by design — the HMAC in the query is the authentication, and the
 * recipient has no session. Exempted in src/proxy.ts for the same reason the
 * billing webhook is: a 307 to /login would make every one-click unsubscribe
 * silently fail while looking like a success.
 *
 * Always answers 200 on a well-formed request. Gmail reads a non-2xx as a broken
 * unsubscribe and holds it against sender reputation.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const token = verifyUnsubscribeToken(
    searchParams.get("e"),
    searchParams.get("c"),
    searchParams.get("t"),
  );

  if (!token) {
    return NextResponse.json({ error: "Invalid unsubscribe link" }, { status: 400 });
  }

  await suppress(token.email, token.category, "unsubscribe");
  return NextResponse.json({ unsubscribed: true });
}
