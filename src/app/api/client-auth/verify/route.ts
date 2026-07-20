import { NextResponse, type NextRequest } from "next/server";

import { createClientSession } from "@/features/client-auth/session";
import { findOrganizationBySubdomain } from "@/features/client-auth/organization";
import { identityFrom } from "@/features/client-auth/rate-limit";
import { verifyCodeSchema } from "@/features/client-auth/schema";
import { verifyOtp } from "@/features/client-auth/otp";

/**
 * POST /api/client-auth/verify — redeem a code and start a parent session
 * (langlion US-4.5/AC1).
 *
 * ─── WHY THE SESSION IS CREATED HERE AND NOT INSIDE `verifyOtp` ─────────────
 *
 * `cookies().set` is only legal in a Route Handler or a Server Function, so the
 * cookie has to be written at the edge. Keeping that constraint here leaves
 * `verifyOtp` callable from anywhere — a job, a unit test, the F5 server action —
 * and leaves this file with the one job it is uniquely able to do.
 *
 * The ordering that matters is inside `verifyOtp`: the code is consumed by a
 * single conditional UPDATE, and its result is checked before this line is
 * reached (decyzja D38). Two requests racing with the same code cannot both
 * arrive at `createClientSession`, because only one of them matched a row.
 *
 * A REJECTION SAYS NOTHING ABOUT WHY. Wrong digits, an expired code, one already
 * redeemed, and one superseded by a resend all return the same 401. Distinguishing
 * them would confirm to a guesser that a code existed, which is most of what they
 * are trying to learn.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = verifyCodeSchema.safeParse(body);
  if (!parsed.success) {
    // A wrongly-shaped code is a 400 rather than a 401, and that leaks nothing:
    // the code's length is printed in the email and fixed in `OTP_LENGTH`. What
    // must not be distinguishable is which VALID-shaped codes exist — and those
    // all take the same path below.
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const organization = await findOrganizationBySubdomain(parsed.data.subdomain);
  if (!organization) {
    return NextResponse.json({ error: "unknown_organization" }, { status: 404 });
  }

  const outcome = await verifyOtp({
    organizationId: organization.id,
    email: parsed.data.email,
    code: parsed.data.code,
    identity: identityFrom(request.headers),
  });

  if (outcome.status === "rate_limited") {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(outcome.retryAfterSeconds) } },
    );
  }

  if (outcome.status === "invalid") {
    return NextResponse.json({ error: "invalid_code" }, { status: 401 });
  }

  await createClientSession(organization.id, outcome.clientId);

  return NextResponse.json({ ok: true });
}
