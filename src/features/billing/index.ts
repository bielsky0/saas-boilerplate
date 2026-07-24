/**
 * Billing feature module (spec 5 — billing & payments).
 *
 * Plans/pricing from config, hosted checkout, customer portal, quota/limit
 * checks (enforced before the action, incremented atomically), and plan-based
 * rendering. Subscription state is always the result of processing a signed,
 * idempotent provider webhook — never guessed client-side.
 *
 * Talks to payment providers ONLY through `src/lib/adapters/billing`
 * (Stripe reference; Lemon Squeezy / Paddle / … pluggable) — spec 1.2, 5.1.
 *
 * This barrel exports the isomorphic pieces only. Server-only modules
 * (`./data`, `./webhooks`) are imported by path so they never reach a client
 * bundle — the same split `features/organizations` uses.
 */

export {
  DEFAULT_PLAN_ID,
  PLANS,
  PLAN_IDS,
  PLAN_LIST,
  isPlanId,
  planIdForPriceId,
  purchasablePlan,
} from "./plans";
export type { Plan, PlanFeature, PlanId, PlanLimits } from "./plans";

// F9: DB-driven plans & limits
export * from "./plans-db";
export * from "./limits";
export * from "./features";
