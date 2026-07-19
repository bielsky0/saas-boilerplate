import { z } from "zod";

import { db } from "@/lib/db";
import { withOwner } from "@/lib/db/tenant";
import type { JobHandler } from "@/lib/adapters/jobs";
import type { BillingOwner } from "./context";
import { clientEnv } from "@/lib/env/client";
import { createLogger } from "@/lib/logger";
import { enqueueEmail } from "@/features/emails/send";
import { enqueueNotification } from "@/features/notifications/send";
import { getSubscriptionByProviderId, resolveBillingRecipients } from "./data";
import { PLANS, type PlanId } from "./plans";

const log = createLogger("billing:notify");

/**
 * Billing notifications (spec 10.2 — payment failure, subscription confirmation).
 *
 * Runs as a job, never inside the webhook transaction. It fans out: it resolves
 * recipients and enqueues one `email.send` CHILD each, rather than sending N mails
 * itself. If it sent them directly, a failure on recipient 2 would retry the whole
 * job and re-mail recipient 1 — children retry independently.
 *
 * Resolving recipients here rather than at enqueue time is also more correct: an
 * Owner added between the event and the send gets the mail, and one removed in that
 * window does not.
 */

/** Statuses where announcing "your subscription is active" is still true. */
const LIVE_STATUSES = ["active", "trialing"];

const notifySchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("payment-failed"),
      organizationId: z.string().nullable(),
      accountId: z.string().nullable(),
      eventId: z.string(),
      amount: z.number(),
      currency: z.string(),
    }),
    z.object({
      kind: z.literal("subscription-confirmed"),
      organizationId: z.string().nullable(),
      accountId: z.string().nullable(),
      eventId: z.string(),
      providerSubscriptionId: z.string(),
    }),
  ])
  // Mirror the `billing_customer_owner_ck` XOR at the edge of the job boundary,
  // not just in the database — the same hardening `notificationJobSchema` got in
  // F1a, for the same reason. Both fields cross jsonb as nullable strings, so a
  // malformed payload would otherwise fail late and obscurely: since F1b as a
  // `42501` RLS refusal whose message points at the policy rather than at the
  // payload that is actually wrong. Refined on the union rather than each member,
  // so one predicate covers both variants.
  .refine((v) => (v.organizationId === null) !== (v.accountId === null), {
    message: "exactly one of organizationId / accountId must be set",
    path: ["organizationId"],
  });

/**
 * Where the recipient goes to act on this. Becomes the provider-hosted portal
 * link when spec 5.5 lands — only this function changes.
 */
function manageUrl(orgSlug: string | null): string {
  return orgSlug
    ? `${clientEnv.NEXT_PUBLIC_APP_URL}/orgs/${orgSlug}/settings`
    : `${clientEnv.NEXT_PUBLIC_APP_URL}/dashboard`;
}

function planName(planId: string | null): string {
  return planId && planId in PLANS ? PLANS[planId as PlanId].name : "your new";
}

export const billingNotifyHandler: JobHandler<"billing.notify"> = async (payload) => {
  const p = notifySchema.parse(payload);

  // Reconstruct the XOR owner from the two nullable payload fields, exactly as
  // `notifications/handler.ts` does. The guarantee that exactly one is set comes
  // from the refine above, which is what makes the `accountId!` sound.
  const owner: BillingOwner = p.organizationId
    ? { kind: "organization", organizationId: p.organizationId }
    : { kind: "personal", accountId: p.accountId! };

  if (p.kind === "subscription-confirmed") {
    /**
     * THE WATERMARK GUARD. `applySubscriptionEvent` drops a stale `created` that
     * arrives after an `updated` (its `setWhere` compares `lastEventAt`), but the
     * enqueue sits OUTSIDE that upsert and fires regardless. Without this re-read,
     * an out-of-order delivery would cheerfully mail "your subscription is active"
     * about a subscription that is already cancelled.
     *
     * Re-reading the CURRENT row is what makes the guard authoritative — the event
     * that caused this job is, by then, only a claim about the past.
     *
     * Owner-scoped since F1b. The payload carries the owner, so this needs no
     * bypass — and the read can now only ever see this owner's subscription,
     * which is what it always meant. One consequence worth knowing when chasing a
     * `subscription-missing` log line for a row that demonstrably exists: under
     * RLS a row belonging to someone else reads as `null` here. That is
     * fail-closed and correct, but it is a second possible cause.
     */
    const sub = await withOwner(owner, (tx) =>
      getSubscriptionByProviderId(tx, p.providerSubscriptionId),
    );
    if (!sub || !LIVE_STATUSES.includes(sub.status)) {
      log.info("skip subscription-confirmed", {
        event: p.eventId,
        reason: sub ? `status=${sub.status}` : "subscription-missing",
      });
      return;
    }

    const { ownerName, orgSlug, mailboxes } = await resolveBillingRecipients(
      p.organizationId,
      p.accountId,
    );
    for (const box of mailboxes) {
      await enqueueEmail(
        db,
        "subscription-confirmed",
        { orgName: ownerName, planName: planName(sub.planId), manageUrl: manageUrl(orgSlug) },
        { to: box.email, ...(box.name ? { name: box.name } : {}), locale: box.locale },
        // Per-CHILD key, including the address: this parent can be re-claimed
        // after a visibility timeout, and re-running the fan-out must not re-mail
        // anyone who already received it.
        { dedupeKey: `email:${p.kind}:${p.eventId}:${box.email.toLowerCase()}` },
      );
      // The SECOND channel (spec 23), enqueued as its own job so email failure and
      // in-app delivery are independent. Per-recipient dedupe on the same basis.
      await enqueueNotification(
        db,
        {
          userId: box.userId,
          organizationId: p.organizationId,
          accountId: p.accountId,
          type: "subscription-confirmed",
          params: { orgName: ownerName, planName: planName(sub.planId) },
          link: manageUrl(orgSlug),
        },
        { dedupeKey: `notif:${p.kind}:${p.eventId}:${box.userId}` },
      );
    }
    return;
  }

  const { ownerName, orgSlug, mailboxes } = await resolveBillingRecipients(
    p.organizationId,
    p.accountId,
  );
  if (mailboxes.length === 0) {
    // Nobody left to tell (every Owner soft-deleted, or the org itself). Not a
    // failure: retrying cannot conjure a recipient.
    log.warn("no recipients for payment-failed", { event: p.eventId });
    return;
  }
  for (const box of mailboxes) {
    await enqueueEmail(
      db,
      "payment-failed",
      { orgName: ownerName, amount: p.amount, currency: p.currency, manageUrl: manageUrl(orgSlug) },
      { to: box.email, ...(box.name ? { name: box.name } : {}), locale: box.locale },
      { dedupeKey: `email:${p.kind}:${p.eventId}:${box.email.toLowerCase()}` },
    );
    // The SECOND channel (spec 23) — its own job, independent of the email above.
    await enqueueNotification(
      db,
      {
        userId: box.userId,
        organizationId: p.organizationId,
        accountId: p.accountId,
        type: "payment-failed",
        params: { orgName: ownerName, amount: p.amount, currency: p.currency },
        link: manageUrl(orgSlug),
      },
      { dedupeKey: `notif:${p.kind}:${p.eventId}:${box.userId}` },
    );
  }
};
