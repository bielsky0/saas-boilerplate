import { z } from "zod";

import { db } from "@/lib/db";
import type { JobHandler } from "@/lib/adapters/jobs";
import { clientEnv } from "@/lib/env/client";
import { createLogger } from "@/lib/logger";
import { enqueueEmail } from "@/features/emails/send";
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

const notifySchema = z.discriminatedUnion("kind", [
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
]);

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
     */
    const sub = await getSubscriptionByProviderId(p.providerSubscriptionId);
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
  }
};
