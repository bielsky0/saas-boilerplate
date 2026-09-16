import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, isNull, type SQL } from "drizzle-orm";

import { notification } from "@repo/db";
import type { Db } from "@repo/db";
import { DB } from "../db/db.module";
import type { NotificationOwner } from "../tenancy/owner";

/**
 * Notifications data service — the Nest twin of the web app's
 * `features/notifications/data.ts` (spec 23.1 / 11.2).
 *
 * Queries are identical by construction: every read/write is scoped by BOTH
 * the recipient (`userId`) and the tenant owner, so isolation is enforced
 * here, not in any client. The caller resolves WHICH owner via
 * `resolveNotificationOwner` and passes it in.
 */
export interface NotificationRow {
  id: string;
  type: string;
  params: Record<string, string | number>;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

function ownerWhere(owner: NotificationOwner): SQL {
  return owner.kind === "organization"
    ? eq(notification.organizationId, owner.organizationId)
    : eq(notification.accountId, owner.accountId);
}

@Injectable()
export class NotificationsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** A recipient's notifications in one context, newest first (the bell list). */
  async listForUser(
    userId: string,
    owner: NotificationOwner,
    limit = 20,
  ): Promise<NotificationRow[]> {
    return this.db
      .select({
        id: notification.id,
        type: notification.type,
        params: notification.params,
        link: notification.link,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      })
      .from(notification)
      .where(and(eq(notification.userId, userId), ownerWhere(owner)))
      .orderBy(desc(notification.createdAt))
      .limit(limit);
  }

  /** Unread count for the bell badge (`readAt IS NULL`). */
  async countUnread(userId: string, owner: NotificationOwner): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(notification)
      .where(and(eq(notification.userId, userId), ownerWhere(owner), isNull(notification.readAt)));
    return row?.n ?? 0;
  }

  /** Mark one notification read (owner + recipient scoped). False if not theirs. */
  async markRead(userId: string, owner: NotificationOwner, id: string): Promise<boolean> {
    const rows = await this.db
      .update(notification)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notification.id, id),
          eq(notification.userId, userId),
          ownerWhere(owner),
          isNull(notification.readAt),
        ),
      )
      .returning({ id: notification.id });
    return rows.length > 0;
  }

  /** Mark every unread notification in this context read. */
  async markAllRead(userId: string, owner: NotificationOwner): Promise<void> {
    await this.db
      .update(notification)
      .set({ readAt: new Date() })
      .where(and(eq(notification.userId, userId), ownerWhere(owner), isNull(notification.readAt)));
  }
}
