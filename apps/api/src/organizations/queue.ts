import { job, type Db } from "@repo/db";
import type { Locale } from "@repo/i18n-core";

/**
 * Queue INSERT helpers for the organizations module (spec 12 — the INSERT half).
 *
 * The drain, handlers and templates stay in web until etap 2.3, so this file
 * must stay row-shape-compatible with web's handlers: `email.send`
 * `{template,data,to,name?,locale}`, `notification.create`
 * `{userId,organizationId,accountId,type,params,link?}` — all JSON primitives,
 * `locale` a plain string captured at enqueue time (the drain has no request).
 *
 * Every helper takes the CALLER's writer (`tx` inside a transaction, `db`
 * otherwise) so the row commits — or rolls back — atomically with the business
 * write (the transactional-outbox shape from ARCHITECTURE.md). `dedupeKey` is
 * globally unique (`onConflictDoNothing`): a redelivery adds no row.
 */

/** Minimal surface shared by `db` and a transaction handle. */
export type QueueWriter = Pick<Db, "insert">;

export interface EnqueueOptions {
  dedupeKey?: string;
  runAt?: Date;
  maxAttempts?: number;
}

async function insertJob(
  writer: QueueWriter,
  name: string,
  payload: Record<string, unknown>,
  options?: EnqueueOptions,
): Promise<void> {
  await writer
    .insert(job)
    .values({
      name,
      payload,
      dedupeKey: options?.dedupeKey ?? null,
      runAt: options?.runAt ?? new Date(),
      ...(options?.maxAttempts !== undefined ? { maxAttempts: options.maxAttempts } : {}),
    })
    // A duplicate key adds no row and is not an error (the webhooks.ts pattern).
    .onConflictDoNothing({ target: [job.dedupeKey] });
}

export interface InvitationEmailData {
  url: string;
  orgName: string;
  inviterName: string;
  role: string;
}

/**
 * Queue an invitation email. The invitation template is transactional-adjacent
 * (an invitee cannot unsubscribe from an invite they never asked to mute), so
 * no suppression check here — web's handler re-checks at send time anyway.
 */
export async function enqueueInvitationEmail(
  writer: QueueWriter,
  data: InvitationEmailData,
  recipient: { to: string; locale: Locale },
  options?: EnqueueOptions,
): Promise<void> {
  await insertJob(
    writer,
    "email.send",
    {
      template: "invitation",
      data: {
        url: data.url,
        orgName: data.orgName,
        inviterName: data.inviterName,
        role: data.role,
      },
      to: recipient.to,
      locale: recipient.locale,
    },
    options,
  );
}

export interface InvitationNotificationInput {
  userId: string;
  accountId: string;
  orgName: string;
  inviterName: string;
  link: string;
}

/**
 * Queue the in-app counterpart of an invitation (spec 23) — for an invitee who
 * ALREADY has an account. Scoped to their PERSONAL account (they are not a
 * member of this org yet). Same `writer`, so a rollback un-sends both.
 */
export async function enqueueInvitationNotification(
  writer: QueueWriter,
  input: InvitationNotificationInput,
  options?: EnqueueOptions,
): Promise<void> {
  await insertJob(
    writer,
    "notification.create",
    {
      userId: input.userId,
      organizationId: null,
      accountId: input.accountId,
      type: "invitation",
      params: { orgName: input.orgName, inviterName: input.inviterName },
      link: input.link,
    },
    options,
  );
}
