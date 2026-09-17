import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, count, desc, eq, isNull, type SQL } from "drizzle-orm";
import { z } from "zod";

import { notification, notificationPreference } from "@repo/db";
import type { Db } from "@repo/db";
import { DB } from "../db/db.module";
import type { NotificationOwner } from "../tenancy/owner";
import { insertJob, type QueueWriter } from "../jobs/queue";
import { kickDrain } from "../jobs/runner";
import { isSuppressibleType, NOTIFICATION_META, type NotificationType } from "./types";

/**
 * Notifications data service — the Nest twin of the web app's
 * `features/notifications/data.ts` (spec 23.1 / 11.2), now WITH the creation
 * pipeline and preferences (faza 2.3).
 *
 * Queries are identical by construction: every read/write is scoped by BOTH
 * the recipient (`userId`) and the tenant owner, so isolation is enforced
 * here, not in any client. The caller resolves WHICH owner via
 * `resolveNotificationOwner` and passes it in.
 */

/**
 * The `notification.create` job payload, re-validated at the moment of
 * delivery (jsonb round-trips are untyped). An unknown `type` fails the parse
 * — a dropped row, never a retry: no future deploy brings that type back.
 */
const notificationJobSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().nullable(),
  accountId: z.string().nullable(),
  type: z.string().refine((t): t is keyof typeof NOTIFICATION_META => t in NOTIFICATION_META, {
    message: "Unknown notification type",
  }),
  params: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  link: z.string().optional(),
});
export interface NotificationRow {
  id: string;
  type: string;
  params: Record<string, string | number>;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface NewNotification {
  userId: string;
  owner: NotificationOwner;
  type: NotificationType;
  params: Record<string, string | number>;
  link?: string;
}

export interface EnqueueNotificationInput {
  userId: string;
  organizationId: string | null;
  accountId: string | null;
  type: NotificationType;
  params?: Record<string, string | number>;
  link?: string;
}

function ownerWhere(owner: NotificationOwner): SQL {
  return owner.kind === "organization"
    ? eq(notification.organizationId, owner.organizationId)
    : eq(notification.accountId, owner.accountId);
}

@Injectable()
export class NotificationsService {
  private readonly log = new Logger("NotificationsService");

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * The ONE way feature code raises an in-app notification (spec 23).
   *
   * Enqueues a `notification.create` job — a SEPARATE row from any
   * `email.send` for the same event, so the two channels retry and
   * dead-letter independently. Suppression is NOT checked here; it is the
   * handler's job, so a preference flipped between enqueue and drain is still
   * honored. Pass a `tx` as `writer` to stay atomic with a business write.
   */
  async enqueueNotification(
    writer: QueueWriter,
    input: EnqueueNotificationInput,
    options?: { dedupeKey?: string },
  ): Promise<void> {
    await insertJob(
      writer,
      "notification.create",
      {
        userId: input.userId,
        organizationId: input.organizationId,
        accountId: input.accountId,
        type: input.type,
        params: input.params ?? {},
        ...(input.link ? { link: input.link } : {}),
      },
      options,
    );
    kickDrain();
  }

  /**
   * The `notification.create` job handler — the ONLY place a notification row
   * is written for a business event. The authoritative in-app suppression
   * check runs here, at the moment of delivery: a suppressed notification is
   * a SUCCESSFUL no-op, never a retry. Idempotent via the job's `dedupeKey`
   * (fan-out sites set a per-recipient key).
   */
  async handleNotificationCreate(payload: unknown): Promise<void> {
    const p = notificationJobSchema.parse(payload);

    if (await this.isInAppSuppressed(p.userId, p.type)) {
      this.log.log(`suppressed userId=${p.userId} type=${p.type}`);
      return;
    }

    // Reconstruct the XOR owner from the two nullable payload fields. The
    // enqueue side guarantees exactly one is set.
    const owner: NotificationOwner = p.organizationId
      ? { kind: "organization", organizationId: p.organizationId }
      : { kind: "personal", accountId: p.accountId! };

    await this.createNotification(this.db, {
      userId: p.userId,
      owner,
      type: p.type,
      params: p.params,
      ...(p.link ? { link: p.link } : {}),
    });
  }

  /**
   * Insert a notification row. Takes a `writer` so a caller inside a
   * transaction stays atomic — though the handler that normally calls this
   * runs standalone with `db`.
   */
  async createNotification(writer: QueueWriter, input: NewNotification): Promise<void> {
    await writer.insert(notification).values({
      userId: input.userId,
      ...(input.owner.kind === "organization"
        ? { organizationId: input.owner.organizationId }
        : { accountId: input.owner.accountId }),
      type: input.type,
      params: input.params,
      ...(input.link ? { link: input.link } : {}),
    });
  }

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

  /**
   * Whether the in-app channel is OFF for this user + type — the authoritative
   * check the handler runs before writing (spec 23 criterion). A
   * non-suppressible type short-circuits to `false` without a query: no
   * preference row can ever silence it, by construction. Absence of a row
   * means the default, which is enabled.
   */
  async isInAppSuppressed(userId: string, type: NotificationType): Promise<boolean> {
    if (!isSuppressibleType(type)) return false;
    const [row] = await this.db
      .select({ inAppEnabled: notificationPreference.inAppEnabled })
      .from(notificationPreference)
      .where(and(eq(notificationPreference.userId, userId), eq(notificationPreference.type, type)))
      .limit(1);
    return row ? !row.inAppEnabled : false;
  }

  /** Every stored preference for a user (deviations from the default). */
  async listPreferences(userId: string): Promise<{ type: string; inAppEnabled: boolean }[]> {
    return this.db
      .select({
        type: notificationPreference.type,
        inAppEnabled: notificationPreference.inAppEnabled,
      })
      .from(notificationPreference)
      .where(eq(notificationPreference.userId, userId));
  }

  /** Upsert one preference (unique on user+type), stamping `updatedAt`. */
  async setPreference(
    userId: string,
    type: NotificationType,
    inAppEnabled: boolean,
  ): Promise<void> {
    await this.db
      .insert(notificationPreference)
      .values({ userId, type, inAppEnabled })
      .onConflictDoUpdate({
        target: [notificationPreference.userId, notificationPreference.type],
        set: { inAppEnabled, updatedAt: new Date() },
      });
  }
}
