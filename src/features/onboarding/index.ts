/**
 * Onboarding feature module (spec 10.3 — automatic email sequences).
 *
 * The day 0 / day 3 / day 7 sequence, triggered once a user verifies their email
 * (see `afterEmailVerification` in the auth adapter) and interrupted when they
 * subscribe to a paid plan.
 *
 * Two decisions worth knowing before changing anything here, both argued in
 * `./sequence`: all three steps are enqueued UPFRONT rather than chained, and the
 * interrupt is a guard evaluated at RUN TIME rather than a deletion of queued rows.
 */

export { ONBOARDING_STEPS, onboardingKeyPrefix, startOnboardingSequence } from "./sequence";
export type { OnboardingStep } from "./sequence";
export { onboardingStepHandler } from "./handler";
export { getOnboardingUser, hasPaidSubscription } from "./data";
export type { OnboardingUser } from "./data";
