import { db } from "@/lib/db";
import type { JobHandler } from "@/lib/adapters/jobs";
import { createLogger } from "@/lib/logger";
import { createNotification, isInAppSuppressed, type NotificationOwner } from "./data";
import { notificationJobSchema } from "./schema";

const log = createLogger("notification");

/**
 * The `notification.create` job handler — the ONLY place a notification row is
 * written for a business event (spec 23).
 *
 * Policy lives here, once, for every notification: the authoritative in-app
 * suppression check (spec 23 criterion — a preference flipped after enqueue is
 * still honored, because THIS is the moment of delivery, not the enqueue). A
 * suppressed notification is a SUCCESSFUL no-op, never a retry: the answer would
 * never change.
 *
 * Idempotent via the job's `dedupeKey` (the fan-out sites set a per-recipient
 * key), so an at-least-once redelivery does not double-insert.
 */
export const notificationCreateHandler: JobHandler<"notification.create"> = async (payload) => {
  const p = notificationJobSchema.parse(payload);

  if (await isInAppSuppressed(p.userId, p.type)) {
    log.info("suppressed", { userId: p.userId, type: p.type });
    return;
  }

  // Reconstruct the XOR owner from the two nullable payload fields. The enqueue
  // side guarantees exactly one is set (it comes from a resolved owner); the
  // schema keeps both as nullable strings across jsonb.
  const owner: NotificationOwner = p.organizationId
    ? { kind: "organization", organizationId: p.organizationId }
    : { kind: "personal", accountId: p.accountId! };

  await createNotification(db, {
    userId: p.userId,
    owner,
    type: p.type,
    params: p.params,
    ...(p.link ? { link: p.link } : {}),
  });
};
