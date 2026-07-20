import { NextResponse, type NextRequest } from "next/server";

import { findOrganizationBySubdomain } from "@/features/client-auth/organization";
import { resolveClientSession } from "@/features/client-auth/session";

/**
 * GET /api/client-auth/session?subdomain=… — who is signed in AT THIS ACADEMY
 * (langlion §2.19, US-4.2/AC1).
 *
 * ⚠️ THE SUBDOMAIN IS PART OF THE QUESTION, NOT DECORATION. There is no answer to
 * "who is signed in" without naming the academy: one cookie resolves to a parent
 * at the academy that issued it and to nobody anywhere else. This route makes
 * that shape explicit, which is why the parameter is required rather than
 * defaulted — and it is the same reason `resolveClientSession` takes an
 * `organizationId` instead of inferring one.
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
export async function GET(request: NextRequest): Promise<NextResponse> {
  const subdomain = request.nextUrl.searchParams.get("subdomain")?.trim().toLowerCase();
  if (!subdomain) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const organization = await findOrganizationBySubdomain(subdomain);
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
