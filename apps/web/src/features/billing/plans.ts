import { env } from "@/lib/env/server";

/**
 * Plan configuration (spec 5.2 — plans defined in config, not hardcoded in UI).
 *
 * ONE definition drives three consumers: the public pricing table (§7.3), the
 * checkout route (which plan maps to which provider price), and entitlements +
 * quota (§5.6/5.7). Changing a price or a limit here changes all three; that is
 * the requirement, and the reason the landing page must not keep a parallel list
 * of its own — it used to, and the two had already drifted (`ent` vs `business`).
 *
 * PRICE IDS come from env, one variable per paid plan, because they differ
 * between provider environments (test vs live) — a missing one then fails with a
 * clear per-variable message (spec 19.1) where a single JSON blob could not.
 *
 * `amount` IS FOR DISPLAY ONLY. What a customer is actually charged is whatever
 * the provider's price object says; checkout sends a price id, never an amount.
 * So a mismatch between this number and the provider is a pricing-table bug, not
 * an overcharge — worth knowing before treating this as the truth about money.
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

const GIB = 1024 ** 3;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
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
    name: "Pro",
    priceId: env.STRIPE_PRICE_PRO ?? null,
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
    name: "Business",
    priceId: env.STRIPE_PRICE_BUSINESS ?? null,
    amount: 9900,
    currency: "usd",
    interval: "month",
    mode: "subscription",
    limits: { members: null, files: null, storageBytes: 250 * GIB },
    features: ["audit.export", "roles.custom"],
    featured: false,
  },
};

/** Every plan, in display order. The pricing table iterates this, not its own list. */
export const PLAN_LIST: readonly Plan[] = PLAN_IDS.map((id) => PLANS[id]);

/** The plan a tenant has when no active subscription resolves — never null. */
export const DEFAULT_PLAN_ID: PlanId = "free";

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

/** Narrow an arbitrary string (e.g. a DB column) to a known plan id. */
export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

/**
 * The plan a caller may actually buy, or null.
 *
 * Null covers both "no such plan" and "this environment has no price id for it";
 * the checkout route turns either into a 404. Free plans are unpurchasable by
 * construction (no price id), so they fall out here rather than needing a
 * separate guard.
 */
export function purchasablePlan(planId: string): (Plan & { priceId: string }) | null {
  if (!isPlanId(planId)) return null;
  const plan = PLANS[planId];
  return plan.priceId === null ? null : { ...plan, priceId: plan.priceId };
}
