import { desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { withSystemBypass } from "@/lib/db/system";
import { notification, user } from "@/lib/db/schema";
import { env } from "@/lib/env/server";

/**
 * Test-only notification inspector (spec 14.1) — the in-app counterpart to
 * `/api/dev/emails`. Lists a user's notifications across every owner context so a
 * spec can assert the SECOND channel fired (or, with a preference off, did not),
 * independently of the email outbox. Disabled in production.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const email = request.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "`email` is required" }, { status: 400 });
  }

  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (!u) return NextResponse.json({ notifications: [] });

  // BYPASS: the inspector deliberately lists a user's notifications across EVERY
  // owner context (org and personal alike) so a test can assert on all of them in
  // one call. That is the whole point of this route, and it is test-only (404 in
  // production).
  const rows = await withSystemBypass("dev notification inspector — every owner context", (tx) =>
    tx
      .select({
        id: notification.id,
        type: notification.type,
        params: notification.params,
        link: notification.link,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      })
      .from(notification)
      .where(eq(notification.userId, u.id))
      .orderBy(desc(notification.createdAt)),
  );

  return NextResponse.json({ notifications: rows });
}
