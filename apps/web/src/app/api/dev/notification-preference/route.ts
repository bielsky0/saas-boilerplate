import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { env } from "@/lib/env/server";
import { setPreference } from "@/features/notifications/data";
import { isNotificationType } from "@/features/notifications/types";

/**
 * Test-only preference setter (spec 14.1) — lets a spec turn a user's in-app
 * channel OFF for one type, so it can assert that disabling the preference
 * actually stops notifications of that type (spec 23 acceptance criterion).
 * Disabled in production.
 *
 * Body: { email, type, inAppEnabled }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    email?: string;
    type?: string;
    inAppEnabled?: boolean;
  };
  if (!body.email || !body.type || typeof body.inAppEnabled !== "boolean") {
    return NextResponse.json({ error: "email, type, inAppEnabled required" }, { status: 400 });
  }
  if (!isNotificationType(body.type)) {
    return NextResponse.json({ error: `unknown type ${body.type}` }, { status: 400 });
  }

  const [u] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, body.email))
    .limit(1);
  if (!u) return NextResponse.json({ error: "user not found" }, { status: 404 });

  await setPreference(u.id, body.type, body.inAppEnabled);
  return NextResponse.json({ ok: true });
}
