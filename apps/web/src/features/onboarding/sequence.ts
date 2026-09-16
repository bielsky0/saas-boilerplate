import type { JobWriter } from "@/lib/adapters/jobs";
import type { TemplateName } from "@/lib/adapters/email";
import { enqueueJob } from "@/features/jobs/enqueue";

/**
 * The onboarding email sequence (spec 10.3).
 *
 * Day 0 welcome → day 3 tips → day 7 features, interrupted if the user subscribes
 * to a paid plan.
 */

export interface OnboardingStep {
  step: string;
  delayDays: number;
  template: TemplateName;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { step: "welcome", delayDays: 0, template: "welcome" },
  { step: "tips", delayDays: 3, template: "onboarding-tips" },
  { step: "features", delayDays: 7, template: "onboarding-features" },
] as const;

/** The prefix every step's dedupe key shares — also the E2E fast-forward scope. */
export function onboardingKeyPrefix(userId: string): string {
  return `onboarding:${userId}:`;
}

/**
 * Enqueue the whole sequence at once.
 *
 * ALL THREE UPFRONT, NOT A CHAIN. If step N enqueued step N+1, every step would
 * be a single point of failure for all later ones: a day-3 job that dead-letters
 * on a transient bug silently erases day 7, with no row left anywhere to notice.
 * Upfront rows are also queryable, which is what §12.2 asks for — one SELECT shows
 * a user's entire scheduled sequence.
 *
 * NEVER INTERRUPTED BY DELETING ROWS. The interrupt lives in the handler's guard
 * instead, because a delete cannot win the race it would need to win: a user who
 * subscribes at 09:59:59.9 against a job claimed at 10:00:00.0 is not saved by any
 * amount of deleting. A guard evaluated inside the job closes that by
 * construction — and once it exists and is authoritative, deleting buys nothing
 * but a second mechanism that can disagree with the first.
 *
 * Three dedupe keys make this safe to call twice, which matters: the auth engine's
 * `afterEmailVerification` early-return is not atomic with the UPDATE that sets
 * `emailVerified`, so a mail scanner prefetching the link while the human clicks
 * can fire it twice.
 */
export async function startOnboardingSequence(writer: JobWriter, userId: string): Promise<void> {
  const now = Date.now();
  for (const s of ONBOARDING_STEPS) {
    await enqueueJob(
      writer,
      "onboarding.step",
      { userId, step: s.step },
      {
        runAt: new Date(now + s.delayDays * 86_400_000),
        dedupeKey: `${onboardingKeyPrefix(userId)}${s.step}`,
      },
    );
  }
}
