import { env } from "@/lib/env/server";

/**
 * Plan configuration (spec 5.2 — plans defined in config, not hardcoded in UI).
 *
 * This phase needs exactly one thing from the plan model: mapping a provider
 * price id onto an internal plan, so a subscription row can record which plan is
 * active. Prices, billing interval, quota limits and unlocked features arrive
 * with the pricing table (§5.2) and quota (§5.6) — deliberately absent here
 * rather than guessed at now.
 *
 * Price ids differ between provider environments (test vs live), so each paid
 * plan reads its own env var: a missing one then fails with a clear per-variable
 * message (spec 19.1), which a single JSON blob could not do.
 */

export const PLAN_IDS = ["free", "pro", "business"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface Plan {
  id: PlanId;
  name: string;
  /** Null = free, or simply not mapped in this environment. */
  priceId: string | null;
}

export const PLANS: Record<PlanId, Plan> = {
  free: { id: "free", name: "Free", priceId: null },
  pro: { id: "pro", name: "Pro", priceId: env.STRIPE_PRICE_PRO ?? null },
  business: { id: "business", name: "Business", priceId: env.STRIPE_PRICE_BUSINESS ?? null },
};

const PLAN_BY_PRICE_ID: ReadonlyMap<string, PlanId> = new Map(
  Object.values(PLANS)
    .filter((plan): plan is Plan & { priceId: string } => plan.priceId !== null)
    .map((plan) => [plan.priceId, plan.id]),
);

/**
 * Resolve a provider price id to an internal plan, or null when this
 * environment has no mapping for it.
 *
 * Null is a legitimate outcome, not an error: the webhook still records the
 * subscription (with `providerPriceId`), because refusing it would leave the
 * database WRONG, which is worse than "unknown plan" — spec 5.4 makes the
 * webhook the source of truth. A null plan fails closed for entitlements
 * (§5.7), and self-heals once the price env var is set and the next
 * subscription event (or a dashboard resend) arrives.
 */
export function planIdForPriceId(priceId: string): PlanId | null {
  return PLAN_BY_PRICE_ID.get(priceId) ?? null;
}
