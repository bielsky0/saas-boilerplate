import { NextResponse } from "next/server";

import { servedOrganization } from "@/features/organizations/served-org";
import { resolveClientSession } from "@/features/client-auth/session";

/**
 * GET /api/client-auth/session — who is signed in AT THIS ACADEMY
 * (langlion §2.19, US-4.2/AC1).
 *
 * ⚠️ THE ACADEMY IS PART OF THE QUESTION, NOT DECORATION. There is no answer to
 * "who is signed in" without naming it: one cookie resolves to a parent at the
 * academy that issued it and to nobody anywhere else. That was true when the
 * academy arrived as `?subdomain=` and is still true now that it arrives in the
 * `Host` header (F4.5) — the same reason `resolveClientSession` takes an
 * `organizationId` rather than inferring one. What changed is only who states
 * it: the address the caller connected to, not a parameter the caller chose.
 *
 * `isVerified` is returned because callers will act on it: US-4.2/AC1 shortens
 * the signup path only for a verified parent, and US-4.2/AC6 gates the v15
 * discount display on that same threshold rather than on mere existence of the
 * row.
 *
 * A signed-out visitor is 200 with `client: null`, not 401. This is a lookup, and
 * "nobody" is a valid answer to it; reserving the error status for actual errors
 * keeps the two apart at the call site.
 */
export async function GET(): Promise<NextResponse> {
  const organization = await servedOrganization();
  if (!organization) {
    return NextResponse.json({ error: "unknown_organization" }, { status: 404 });
  }

  const principal = await resolveClientSession(organization.id);

  return NextResponse.json({
    client: principal
      ? {
          id: principal.clientId,
          email: principal.email,
          name: principal.name,
          isVerified: principal.isVerified,
        }
      : null,
  });
}
