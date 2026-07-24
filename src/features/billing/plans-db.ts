import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  plan,
  planFeatureFlag,
  planLimitDefinition,
  organizationLimitOverride,
} from "@/lib/db/schema";

/**
 * Database-driven plans access layer (F9, EPIK 29) — replaces hardcoded `plans.ts`.
 *
 * All reads are uncached (live) so Super Admin changes take effect immediately
 * without deploy. This is the single source of truth for:
 * - plan metadata (code, name, stripe_price_id, is_active, sort_order)
 * - plan limits (max_students, max_groups, etc.)
 * - plan feature flags (subscriptions_enabled, multi_location, etc.)
 * - organization overrides (per-org exceptions)
 */

/**
 * Get a plan by its code (e.g. 'trial', 'basic', 'pro').
 * Returns null if not found or soft-deleted.
 */
export async function getPlanByCode(code: string) {
  const [row] = await db
    .select()
    .from(plan)
    .where(and(eq(plan.code, code), isNull(plan.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Get a plan by its UUID id.
 * Returns null if not found or soft-deleted.
 */
export async function getPlanById(id: string) {
  const [row] = await db
    .select()
    .from(plan)
    .where(and(eq(plan.id, id), isNull(plan.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Get all active plans, ordered by sort_order.
 * Used by pricing page and admin list.
 */
export async function getActivePlans() {
  return db
    .select()
    .from(plan)
    .where(and(eq(plan.isActive, true), isNull(plan.deletedAt)))
    .orderBy(plan.sortOrder);
}

/**
 * Get all plans (including inactive/deleted) for Super Admin.
 */
export async function getAllPlans() {
  return db.select().from(plan).orderBy(plan.sortOrder);
}

/**
 * Get all limit definitions for a plan.
 * Returns Map<limitKey, limitValue | null> where null = unlimited.
 */
export async function getPlanLimits(planId: string): Promise<Map<string, number | null>> {
  const rows = await db
    .select({ limitKey: planLimitDefinition.limitKey, limitValue: planLimitDefinition.limitValue })
    .from(planLimitDefinition)
    .where(eq(planLimitDefinition.planId, planId));

  const limits = new Map<string, number | null>();
  for (const row of rows) {
    limits.set(row.limitKey, row.limitValue ?? null);
  }
  return limits;
}

/**
 * Get all feature flags for a plan.
 * Returns Map<featureKey, isEnabled>.
 * Missing key = fail-closed (disabled).
 */
export async function getPlanFeatures(planId: string): Promise<Map<string, boolean>> {
  const rows = await db
    .select({ featureKey: planFeatureFlag.featureKey, isEnabled: planFeatureFlag.isEnabled })
    .from(planFeatureFlag)
    .where(eq(planFeatureFlag.planId, planId));

  const features = new Map<string, boolean>();
  for (const row of rows) {
    features.set(row.featureKey, row.isEnabled);
  }
  return features;
}

/**
 * Get organization limit override for a specific key.
 * Returns limitValue | null (null = unlimited) or undefined if no override.
 */
export async function getOrgLimitOverride(
  organizationId: string,
  limitKey: string,
): Promise<number | null | undefined> {
  const [row] = await db
    .select({ limitValue: organizationLimitOverride.limitValue })
    .from(organizationLimitOverride)
    .where(
      and(
        eq(organizationLimitOverride.organizationId, organizationId),
        eq(organizationLimitOverride.limitKey, limitKey),
      ),
    )
    .limit(1);
  return row?.limitValue ?? undefined;
}

/**
 * Get all limit overrides for an organization.
 * Returns Map<limitKey, limitValue | null>.
 */
export async function getOrgLimitOverrides(
  organizationId: string,
): Promise<Map<string, number | null>> {
  const rows = await db
    .select({ limitKey: organizationLimitOverride.limitKey, limitValue: organizationLimitOverride.limitValue })
    .from(organizationLimitOverride)
    .where(eq(organizationLimitOverride.organizationId, organizationId));

  const overrides = new Map<string, number | null>();
  for (const row of rows) {
    overrides.set(row.limitKey, row.limitValue ?? null);
  }
  return overrides;
}