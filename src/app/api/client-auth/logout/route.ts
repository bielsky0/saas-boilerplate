import { NextResponse } from "next/server";

import { destroyClientSession } from "@/features/client-auth/session";
import { servedOrganization } from "@/features/organizations/served-org";

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
 *
 * TAKES NO BODY (F4.5). The academy comes from the `Host` header and the parent
 * from the cookie, so there is nothing left for a caller to state. The body is
 * not parsed at all rather than parsed against an empty schema — validating a
 * shape nobody reads is a prop, and it would reject a plain `POST` with no body,
 * which is precisely the natural way to call this.
 */
export async function POST(): Promise<NextResponse> {
  const organization = await servedOrganization();
  if (!organization) {
    return NextResponse.json({ error: "unknown_organization" }, { status: 404 });
  }

  await destroyClientSession(organization.id);

  return NextResponse.json({ ok: true });
}
