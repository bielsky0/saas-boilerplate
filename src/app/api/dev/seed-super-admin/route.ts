import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { env } from "@/lib/env/server";

/**
 * Test-only super-admin promoter (spec 14.1). Grants the system-level flag to an
 * existing seeded user so the §6 E2E suite has a deterministic admin. Disabled in
 * production.
 *
 * This writes the role column directly rather than going through
 * `setSuperAdminAction`, because that action requires an existing super admin —
 * bootstrapping is exactly the case it cannot serve. It is the same operation the
 * documented production SQL snippet performs (see docs/ARCHITECTURE.md); there is
 * deliberately NO in-app bootstrap path.
 *
 * Body: { email }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { email } = (await request.json()) as { email?: string };
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const updated = await db
    .update(user)
    // Must match SUPER_ADMIN_ROLE in the auth adapter exactly — the engine's
    // target-is-admin check is case-sensitive.
    .set({ role: "superadmin" })
    .where(eq(user.email, email))
    .returning({ id: user.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: `user ${email} not found` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, userId: updated[0]!.id });
}
