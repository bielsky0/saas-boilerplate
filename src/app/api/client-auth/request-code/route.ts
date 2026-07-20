import { NextResponse, type NextRequest } from "next/server";

import { findOrganizationBySubdomain } from "@/features/client-auth/organization";
import { identityFrom } from "@/features/client-auth/rate-limit";
import { issueOtp } from "@/features/client-auth/otp";
import { requestCodeSchema } from "@/features/client-auth/schema";
import { requestLocale } from "@/lib/i18n/request-locale";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";

/**
 * POST /api/client-auth/request-code — email a parent a one-time code
 * (langlion US-4.1 + US-4.5).
 *
 * A REAL ENDPOINT, not a test seam. F3 ships parent authentication complete; only
 * the screens are deferred to F5, where the subdomain middleware lands and the
 * academy stops being a body field (see `features/client-auth/organization.ts`).
 * Nothing below is a placeholder for that phase to replace.
 *
 * ─── THE RESPONSE IS THE SAME WHATEVER HAPPENED ─────────────────────────────
 *
 * New address, known parent, soft-deleted parent — all answer `{ ok: true }`.
 * Only two things change the status: a malformed body (400) and an academy that
 * does not exist (404, and a subdomain is a public hostname, so there is nothing
 * to conceal there). Everything else would be telling an anonymous caller which
 * addresses belong to which academy.
 *
 * Rate limiting is applied INSIDE `issueOtp`, per address and per IP. The proxy's
 * `write` tier already counts this path, and it is not sufficient on its own: a
 * generic per-IP ceiling has no opinion about how many codes one inbox receives.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = requestCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const organization = await findOrganizationBySubdomain(parsed.data.subdomain);
  if (!organization) {
    return NextResponse.json({ error: "unknown_organization" }, { status: 404 });
  }

  // The parent has no stored locale — they are not a boilerplate `user` and have
  // no profile yet — so the language of the request is the best available answer.
  // Resolved HERE rather than at send time because the drain has no request.
  const locale = (await requestLocale()) ?? DEFAULT_LOCALE;

  const outcome = await issueOtp({
    organizationId: organization.id,
    organizationName: organization.name,
    email: parsed.data.email,
    name: parsed.data.name ?? null,
    phone: parsed.data.phone ?? null,
    locale,
    identity: identityFrom(request.headers),
  });

  if (outcome.status === "rate_limited") {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(outcome.retryAfterSeconds) } },
    );
  }

  return NextResponse.json({ ok: true });
}
