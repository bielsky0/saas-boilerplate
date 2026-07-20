import { NextResponse } from "next/server";

import { resolveNotificationOwner } from "@/features/notifications/context";
import { countUnread, listNotificationsForUser } from "@/features/notifications/data";
import { withOwner } from "@/lib/db/tenant";

/**
 * Notifications polling endpoint (spec 23.2 / 23.4) — the read side of the bell.
 *
 * Session-protected by the proxy; still resolves the owner here, because the
 * proxy is a UX convenience, not the security boundary. An academy host → org
 * context (requires active membership); the apex → the caller's personal account.
 * Returns the unread count for the badge + the most recent notifications, scoped
 * to the acting owner so no notification leaks across tenants. Reads only —
 * mark-read is a server action.
 */
export async function GET(): Promise<NextResponse> {
  const { owner, userId } = await resolveNotificationOwner();

  // One transaction rather than `Promise.all`. Both queries hit `notification`,
  // which is under RLS, so each needs the owner GUC — and two `withOwner` calls
  // would take two pooled connections to serve one poll that fires every 15s.
  // Sequential inside one transaction is two round-trips on one connection.
  const { unreadCount, items } = await withOwner(owner, async (tx) => ({
    unreadCount: await countUnread(tx, userId, owner),
    items: await listNotificationsForUser(tx, userId, owner),
  }));

  return NextResponse.json({ unreadCount, items });
}
