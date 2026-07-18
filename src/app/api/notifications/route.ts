import { NextResponse, type NextRequest } from "next/server";

import { resolveNotificationOwner } from "@/features/notifications/context";
import { countUnread, listNotificationsForUser } from "@/features/notifications/data";

/**
 * Notifications polling endpoint (spec 23.2 / 23.4) — the read side of the bell.
 *
 * Session-protected by the proxy; still resolves the owner here, because the
 * proxy is a UX convenience, not the security boundary. `slug` present → org
 * context (requires active membership); absent → the caller's personal account.
 * Returns the unread count for the badge + the most recent notifications, scoped
 * to the acting owner so no notification leaks across tenants. Reads only —
 * mark-read is a server action.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const slug = request.nextUrl.searchParams.get("slug");
  const { owner, userId } = await resolveNotificationOwner(slug);

  const [unreadCount, items] = await Promise.all([
    countUnread(userId, owner),
    listNotificationsForUser(userId, owner),
  ]);

  return NextResponse.json({ unreadCount, items });
}
