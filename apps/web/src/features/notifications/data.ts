import { and, count, desc, eq, isNull, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import type { JobWriter } from "@/lib/adapters/jobs";
import { notification, notificationPreference } from "@/lib/db/schema";
import { isSuppressibleType, type NotificationType } from "./types";

/**
 * Notifications data-access layer (spec 23.1 / 11.2 — tenant-scoped queries).
 *
 * Every read/write is scoped by BOTH the recipient (`userId`) and the tenant
 * owner (org or personal account), so a user can only ever see or clear their own
 * notifications in the context they are acting as — isolation enforced here, not
 * in the UI (the same invariant as `features/storage/data.ts`). A caller resolves
 * WHICH owner via `resolveNotificationOwner` and passes it as a `NotificationOwner`.
 */

/** The tenant a notification operation acts as. Exactly one owner, mirroring the XOR. */
export type NotificationOwner =
  { kind: "organization"; organizationId: string } | { kind: "personal"; accountId: string };

/** The owner predicate — an org notification by org id, a personal one by account id. */
function ownerWhere(owner: NotificationOwner): SQL {
  return owner.kind === "organization"
    ? eq(notification.organizationId, owner.organizationId)
    : eq(notification.accountId, owner.accountId);
}

/** Columns to persist on the owner, spread into an insert. */
function ownerColumns(owner: NotificationOwner): { organizationId?: string; accountId?: string } {
  return owner.kind === "organization"
    ? { organizationId: owner.organizationId }
    : { accountId: owner.accountId };
}

export type NewNotification = {
  userId: string;
  owner: NotificationOwner;
  type: NotificationType;
  params: Record<string, string | number>;
  link?: string;
};

/**
 * Insert a notification row. Takes a `writer` so a caller inside a transaction
 * can keep it atomic with a business write, exactly like `enqueueEmail` — though
 * the handler that normally calls this runs standalone with `db`.
 */
export async function createNotification(writer: JobWriter, input: NewNotification): Promise<void> {
  await writer.insert(notification).values({
    userId: input.userId,
    ...ownerColumns(input.owner),
    type: input.type,
    params: input.params,
    ...(input.link ? { link: input.link } : {}),
  });
}

export type NotificationRow = {
  id: string;
  type: string;
  params: Record<string, string | number>;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

/** A recipient's notifications in one context, newest first (the bell list). */
export async function listNotificationsForUser(
  userId: string,
  owner: NotificationOwner,
  limit = 20,
): Promise<NotificationRow[]> {
  const rows = await db
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
  return rows;
}

/** Unread count for the bell badge (the unread predicate is `readAt IS NULL`). */
export async function countUnread(userId: string, owner: NotificationOwner): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notification)
    .where(and(eq(notification.userId, userId), ownerWhere(owner), isNull(notification.readAt)));
  return row?.n ?? 0;
}

/** Mark one notification read (owner + recipient scoped). False if not theirs. */
export async function markRead(
  userId: string,
  owner: NotificationOwner,
  id: string,
): Promise<boolean> {
  const rows = await db
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
export async function markAllRead(userId: string, owner: NotificationOwner): Promise<void> {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.userId, userId), ownerWhere(owner), isNull(notification.readAt)));
}

/**
 * Whether the in-app channel is OFF for this user + type — the authoritative
 * check the handler runs before writing a notification (spec 23 criterion).
 *
 * A non-suppressible type (a §23.3 security notice) short-circuits to `false`
 * without a query: no preference row can ever silence it, by construction.
 * Absence of a row means the default, which is enabled.
 */
export async function isInAppSuppressed(userId: string, type: NotificationType): Promise<boolean> {
  if (!isSuppressibleType(type)) return false;
  const [row] = await db
    .select({ inAppEnabled: notificationPreference.inAppEnabled })
    .from(notificationPreference)
    .where(and(eq(notificationPreference.userId, userId), eq(notificationPreference.type, type)))
    .limit(1);
  return row ? !row.inAppEnabled : false;
}

export type PreferenceRow = { type: string; inAppEnabled: boolean };

/** Every stored preference for a user (deviations from the default). */
export async function listPreferences(userId: string): Promise<PreferenceRow[]> {
  return db
    .select({
      type: notificationPreference.type,
      inAppEnabled: notificationPreference.inAppEnabled,
    })
    .from(notificationPreference)
    .where(eq(notificationPreference.userId, userId));
}

/** Upsert one preference (unique on user+type), stamping `updatedAt`. */
export async function setPreference(
  userId: string,
  type: NotificationType,
  inAppEnabled: boolean,
): Promise<void> {
  await db
    .insert(notificationPreference)
    .values({ userId, type, inAppEnabled })
    .onConflictDoUpdate({
      target: [notificationPreference.userId, notificationPreference.type],
      set: { inAppEnabled, updatedAt: new Date() },
    });
}
