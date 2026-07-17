import { z } from "zod";

import { db } from "@/lib/db";
import type { JobHandler } from "@/lib/adapters/jobs";
import { createLogger } from "@/lib/logger";
import { enqueueEmail } from "@/features/emails/send";
import { getOnboardingUser, hasPaidSubscription } from "./data";
import { ONBOARDING_STEPS } from "./sequence";

const log = createLogger("onboarding");

/**
 * One step of the onboarding sequence (spec 10.3).
 *
 * Does not send: it guards, resolves the recipient, and enqueues an `email.send`
 * child. Two hops, one delivery path — see features/emails/send.ts. (This is why
 * the adapter's `drain` loops batches rather than draining once: the child must be
 * picked up in the same drain.)
 */

const stepPayloadSchema = z.object({
  userId: z.string().min(1),
  step: z.string().min(1),
});

export const onboardingStepHandler: JobHandler<"onboarding.step"> = async (payload) => {
  const { userId, step } = stepPayloadSchema.parse(payload);

  const definition = ONBOARDING_STEPS.find((s) => s.step === step);
  if (!definition) {
    // A step that no longer exists is deploy skew, not a transient fault. Treat it
    // as done: retrying can never make an removed step reappear.
    log.warn("unknown step — skipping", { step, user: userId });
    return;
  }

  const recipient = await getOnboardingUser(userId);
  // Soft-deleted or purged (spec 11.3). A no-op is success — there is nobody to
  // mail, and no retry changes that.
  if (!recipient) return;

  // THE INTERRUPT, evaluated NOW rather than at enqueue time. This is the whole
  // reason the sequence is not cancelled by deleting rows: a delete would race the
  // claim, and this cannot.
  if (await hasPaidSubscription(userId)) {
    log.info("skip", { user: userId, step, reason: "subscribed" });
    return;
  }

  await enqueueEmail(
    db,
    definition.template,
    { name: recipient.name },
    {
      to: recipient.email,
      ...(recipient.name ? { name: recipient.name } : {}),
      // Resolved NOW, at enqueue — this handler is itself a day-3/day-7 job, and
      // the child `email.send` it queues will be drained later still.
      locale: recipient.locale,
    },
    // The parent can be re-claimed after a visibility timeout (the queue is
    // at-least-once). This key is what makes that re-run not re-mail.
    { dedupeKey: `email:onboarding:${userId}:${step}` },
  );
};
