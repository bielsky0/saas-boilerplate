import { env } from "@/lib/env/server";
import { DEFAULT_PLAN_ID, PLAN_IDS, PLAN_NAMES, createCatalog, isPlanId } from "@repo/billing";
import type { Plan, PlanFeature, PlanId, PlanLimits } from "@repo/billing";

/**
 * Web plan catalog instance (spec 5.2 — plans defined in config, not hardcoded
 * in UI).
 *
 * Compat layer: the vocabulary moved to `@repo/billing` in faza 2.5 (shared
 * with the API, so the pricing table, checkout and the webhook can never
 * disagree). This module builds the web app's instance from its own validated
 * env (`STRIPE_PRICE_*` differ per environment) and re-exports the same names,
 * so the landing page and the billing panel read from one place without
 * importing env themselves.
 *
 * Server-only (reads `env/server`) — client components import only the `type`
 * members, which erase at compile time.
 */

const catalog = createCatalog({
  pro: env.STRIPE_PRICE_PRO ?? null,
  business: env.STRIPE_PRICE_BUSINESS ?? null,
});

export const PLANS = catalog.PLANS;
export const PLAN_LIST = catalog.PLAN_LIST;
export const planIdForPriceId = catalog.planIdForPriceId;
export const purchasablePlan = catalog.purchasablePlan;
export const planDisplayName = catalog.planDisplayName;

export { DEFAULT_PLAN_ID, PLAN_IDS, PLAN_NAMES, isPlanId };
export type { Plan, PlanFeature, PlanId, PlanLimits };
