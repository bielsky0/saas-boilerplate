/**
 * Billing catalog (spec 5.2 — plans defined in config, not hardcoded in UI).
 *
 * The SINGLE source of truth for plan vocabulary, shared by the web app, the
 * NestJS API, and any future backend — so the pricing table, checkout, the
 * webhook's price→plan mapping, and the confirmation mail can never disagree
 * about what a plan is called or what it contains.
 *
 * Split deliberately in two:
 * - STATIC vocabulary (ids, names, limits, features, statuses): pure data, no
 *   environment, safe to import anywhere including client components;
 * - PRICES via `createCatalog()`: provider price ids differ per environment
 *   (test vs live), so each app builds its catalog once from its own config
 *   (web: `features/billing/plans.ts`, api: `BillingService`). Nothing here
 *   reads `process.env` — a package that did could not be consumed by both.
 */

export const PLAN_IDS = ["free", "pro", "business"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/**
 * Entitlements unlocked by a plan (spec 5.2 "features", enforced in §5.7).
 *
 * Deliberately small and grounded: each member gates something this codebase
 * actually has or is actively building. Aspirational entries would produce
 * entitlement checks with nothing behind them.
 */
export type PlanFeature = "audit.export" | "roles.custom";

/**
 * Per-plan ceilings (spec 5.6). `null` means unlimited — distinct from 0, which
 * would mean "forbidden". Enforcement is §5.6's job; this file only declares.
 */
export interface PlanLimits {
  /** Active members per organization, including owners. */
  members: number | null;
  /** Stored files per tenant (soft-deleted ones do not count). */
  files: number | null;
  /** Total stored bytes per tenant. */
  storageBytes: number | null;
}

export interface Plan {
  id: PlanId;
  /** Product name. A proper noun, deliberately not translated (spec 16 exempts brands). */
  name: string;
  /** Null = free, or simply not mapped in this environment. */
  priceId: string | null;
  /** Minor units (cents/grosze) — an integer, never a float. Display only. */
  amount: number;
  /** ISO 4217, lowercase to match provider conventions. */
  currency: string;
  /** Null for free plans, which have no billing period to show. */
  interval: "month" | "year" | null;
  /** Recurring vs one-time purchase (spec 5.2 supports both). */
  mode: "subscription" | "payment";
  limits: PlanLimits;
  features: readonly PlanFeature[];
  /** Highlighted in the pricing table. Presentation, not entitlement. */
  featured: boolean;
}

/** Display names for mails and UI sentences (spec 5.2). Static, like the ids. */
export const PLAN_NAMES: Record<PlanId, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

/** The plan a tenant has when no active subscription resolves — never null. */
export const DEFAULT_PLAN_ID: PlanId = "free";

/**
 * Provider subscription statuses (spec 5.4). The column is `text`, because the
 * webhook is the source of truth and refusing to store an unrecognized status
 * would leave the database WRONG about what the provider said — so every
 * reader narrows through `isSubscriptionStatus` instead.
 */
export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

/**
 * Statuses that entitle a tenant to its plan.
 *
 * `past_due` is deliberately included: the provider is still retrying the card
 * and the subscription is not over. Cutting access at the first failed charge
 * punishes an expired card the same as a refusal to pay, and the dunning email
 * (§10.2) is the correct first response. `unpaid`/`canceled` are the end of that
 * road and do NOT appear here.
 */
export const ENTITLING_STATUSES: readonly SubscriptionStatus[] = ["active", "trialing", "past_due"];

/**
 * Statuses where announcing "your subscription is active" is still true.
 *
 * Narrower than `ENTITLING_STATUSES` on purpose: `past_due` entitles (access
 * stays) but must not trigger a confirmation mail (nothing is confirmed).
 * The onboarding interrupt (§10.3) also reads this set — a member of a
 * past-due team keeps access, yet is still a customer worth onboarding.
 */
export const LIVE_STATUSES: readonly SubscriptionStatus[] = ["active", "trialing"];

/** Provider price ids for this environment. Null = not mapped here. */
export interface BillingPrices {
  pro: string | null;
  business: string | null;
}

const GIB = 1024 ** 3;

export interface BillingCatalog {
  PLANS: Record<PlanId, Plan>;
  /** Every plan, in display order. The pricing table iterates this, not its own list. */
  PLAN_LIST: readonly Plan[];
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
  planIdForPriceId(priceId: string): PlanId | null;
  /**
   * The plan a caller may actually buy, or null.
   *
   * Null covers both "no such plan" and "this environment has no price id for
   * it"; the checkout route turns either into a 404. Free plans are
   * unpurchasable by construction (no price id), so they fall out here rather
   * than needing a separate guard.
   */
  purchasablePlan(planId: string): (Plan & { priceId: string }) | null;
  /**
   * Display name for mails and sentences, or null when unknown — callers fall
   * back to generic copy (`?? "your new"`), never to a crash.
   */
  planDisplayName(planId: string | null): string | null;
}

/**
 * Build the price-bound catalog for one environment.
 *
 * `amount` IS FOR DISPLAY ONLY. What a customer is actually charged is whatever
 * the provider's price object says; checkout sends a price id, never an amount.
 * So a mismatch between this number and the provider is a pricing-table bug, not
 * an overcharge — worth knowing before treating this as the truth about money.
 */
export function createCatalog(prices: BillingPrices): BillingCatalog {
  const PLANS: Record<PlanId, Plan> = {
    free: {
      id: "free",
      name: PLAN_NAMES.free,
      priceId: null,
      amount: 0,
      currency: "usd",
      interval: null,
      mode: "subscription",
      limits: { members: 3, files: 20, storageBytes: GIB },
      features: [],
      featured: false,
    },
    pro: {
      id: "pro",
      name: PLAN_NAMES.pro,
      priceId: prices.pro,
      amount: 2900,
      currency: "usd",
      interval: "month",
      mode: "subscription",
      limits: { members: 15, files: 500, storageBytes: 25 * GIB },
      features: ["audit.export"],
      featured: true,
    },
    business: {
      id: "business",
      name: PLAN_NAMES.business,
      priceId: prices.business,
      amount: 9900,
      currency: "usd",
      interval: "month",
      mode: "subscription",
      limits: { members: null, files: null, storageBytes: 250 * GIB },
      features: ["audit.export", "roles.custom"],
      featured: false,
    },
  };

  const PLAN_LIST: readonly Plan[] = PLAN_IDS.map((id) => PLANS[id]);

  const byPriceId = new Map(
    Object.values(PLANS)
      .filter((plan): plan is Plan & { priceId: string } => plan.priceId !== null)
      .map((plan) => [plan.priceId, plan.id]),
  );

  return {
    PLANS,
    PLAN_LIST,
    planIdForPriceId(priceId: string): PlanId | null {
      return byPriceId.get(priceId) ?? null;
    },
    purchasablePlan(planId: string): (Plan & { priceId: string }) | null {
      if (!isPlanId(planId)) return null;
      const plan = PLANS[planId];
      return plan.priceId === null ? null : { ...plan, priceId: plan.priceId };
    },
    planDisplayName(planId: string | null): string | null {
      if (!planId || !isPlanId(planId)) return null;
      return PLAN_NAMES[planId];
    },
  };
}

/** Narrow an arbitrary string (e.g. a DB column) to a known plan id. */
export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

/**
 * Display name for mails and sentences, or null when unknown — callers fall
 * back to generic copy (`?? "your new"`), never to a crash. Static (names do
 * not depend on prices), so it needs no catalog instance.
 */
export function planDisplayName(planId: string | null): string | null {
  if (!planId || !isPlanId(planId)) return null;
  return PLAN_NAMES[planId];
}
