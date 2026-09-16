import type { BillingSubscriptionStatus } from "@/lib/adapters/billing";

/**
 * Runtime narrowing for `subscription.status`.
 *
 * The column is `text`, because the webhook is the source of truth and refusing
 * to store a status we do not recognize would leave the database WRONG about what
 * the provider said (the same argument as `planIdForPriceId` returning null). So
 * everything reading it back has to narrow, and this is the one place that does.
 *
 * The list is spelled out here rather than imported from the adapter because
 * `BillingSubscriptionStatus` is a type, not a value — `satisfies` is what keeps
 * the two from drifting: adding a member to the union without adding it here is a
 * typecheck failure.
 */
const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const satisfies readonly BillingSubscriptionStatus[];

export function isSubscriptionStatus(value: string): value is BillingSubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}
