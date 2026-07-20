import { NextResponse, type NextRequest } from "next/server";

import { destroyClientSession } from "@/features/client-auth/session";
import { findOrganizationBySubdomain } from "@/features/client-auth/organization";
import { logoutSchema } from "@/features/client-auth/schema";

/**
 * POST /api/client-auth/logout — end a parent's session (plan F3 / D37).
 *
 * POST, not GET: this changes state, and a GET would be followed by link
 * prefetchers and mail-scanning proxies, logging parents out at random.
 *
 * The row is deleted before the cookie is cleared, so a copied token stops
 * working immediately rather than at its 30-day expiry — the revocation property
 * that a stateless signed cookie could not have offered (see `session.ts`).
 *
 * Always `{ ok: true }` for a resolvable academy, including when there was no
 * session to end. "Log out" is a request about a desired end state, and the end
 * state is reached either way; a 401 here would only complicate every caller.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = logoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const organization = await findOrganizationBySubdomain(parsed.data.subdomain);
  if (!organization) {
    return NextResponse.json({ error: "unknown_organization" }, { status: 404 });
  }

  await destroyClientSession(organization.id);

  return NextResponse.json({ ok: true });
}
