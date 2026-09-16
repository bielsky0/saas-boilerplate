import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { env } from "@/lib/env/server";

/**
 * Test-only user lookup (spec 14.1).
 *
 * Exists because the onboarding sequence's dedupe keys are scoped by user id
 * (`onboarding:{userId}:…`), and a test needs that id to fast-forward ITS OWN jobs
 * without disturbing anyone else's. `seedUser` cannot return it: it goes through
 * `signUpEmailPassword`, which is deliberately anti-enumerating and resolves the
 * same way whether or not the account already existed.
 *
 * Disabled in production.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const email = request.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "`email` is required" }, { status: 400 });
  }

  const [row] = await db
    .select({ id: user.id, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
