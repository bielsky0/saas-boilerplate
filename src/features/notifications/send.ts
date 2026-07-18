import type { JobWriter } from "@/lib/adapters/jobs";
import { enqueueJob } from "@/features/jobs/enqueue";
import type { NotificationType } from "./types";

/**
 * The ONE way feature code raises an in-app notification (spec 23).
 *
 * Enqueues a `notification.create` job — a SEPARATE row from any `email.send`
 * for the same event, which is what makes the two channels independent: a failed
 * email retries and dead-letters on its own row without ever touching this one
 * (spec 23 — "oba kanały niezależne"). Suppression is NOT checked here; it is the
 * handler's job, so a preference flipped between enqueue and drain is still
 * honored — the same enqueue/handler split as `enqueueEmail`.
 *
 * Pass a `tx` as `writer` to make the notification atomic with a business write
 * (the invitation call site does this); pass `db` when there is no transaction to
 * join (the billing fan-out and the auth-engine hook).
 */
export interface EnqueueNotificationInput {
  userId: string;
  organizationId: string | null;
  accountId: string | null;
  type: NotificationType;
  params?: Record<string, string | number>;
  link?: string;
}

export interface EnqueueNotificationOptions {
  /** Makes the create exactly-once for a given cause (fan-outs whose parent re-runs). */
  dedupeKey?: string;
}

export async function enqueueNotification(
  writer: JobWriter,
  input: EnqueueNotificationInput,
  options?: EnqueueNotificationOptions,
): Promise<void> {
  await enqueueJob(
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
}
