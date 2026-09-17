/**
 * Shared billing vocabulary (spec 5.2 — plans defined once, read everywhere).
 *
 * Pure data + pure functions: no environment, no framework, no `@repo/*`
 * imports — so the web app, the NestJS API, and any future backend consume the
 * same plan table, the same status sets, and the same price→plan mapping.
 * Environment-bound prices enter through `createCatalog()`, never through
 * `process.env` here.
 */
export {
  DEFAULT_PLAN_ID,
  ENTITLING_STATUSES,
  LIVE_STATUSES,
  PLAN_IDS,
  PLAN_NAMES,
  SUBSCRIPTION_STATUSES,
  createCatalog,
  isPlanId,
  isSubscriptionStatus,
  planDisplayName,
} from "./catalog";
export type {
  BillingCatalog,
  BillingPrices,
  Plan,
  PlanFeature,
  PlanId,
  PlanLimits,
  SubscriptionStatus,
} from "./catalog";
