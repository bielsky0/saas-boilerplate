import { and, count, countDistinct, eq, gte, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { enqueueEmail } from "@/features/emails/send";
import { env } from "@/lib/env/server";
import {
  organizationLimitOverride,
  planFeatureFlag,
  planLimitDefinition,
  plan,
  organization,
} from "@/lib/db/schema";

/**
 * Limit enforcement helper (F9, EPIK 29).
 *
 * Priority: organization_limit_override → plan_limit_definition → fail-closed (0).
 * Returns: number (explicit limit) | null (unlimited).
 * Fail-closed means: if no plan_limit_definition row exists for the plan+key, return 0 (block).
 *
 * Live COUNT without FOR UPDATE (spec §7 decisions #10–#12).
 * Acceptable risk: transient over-limit by 1 on concurrent admin actions.
 */

/** All known limit keys (matching §2.20 table). */
export type LimitKey =
  | "max_students"
  | "max_groups"
  | "max_trainers"
  | "max_locations"
  | "max_sessions_per_month";

/**
 * Get effective limit for an organization and limit key.
 * Priority: override → plan → fail-closed (0).
 * Returns null = unlimited, 0 = fail-closed (block), positive number = explicit limit.
 */
export async function getEffectiveLimit(
  organizationId: string,
  limitKey: LimitKey,
): Promise<number | null> {
  // 1. Check organization override first (highest priority)
  const [override] = await db
    .select({ limitValue: organizationLimitOverride.limitValue })
    .from(organizationLimitOverride)
    .where(
      and(
        eq(organizationLimitOverride.organizationId, organizationId),
        eq(organizationLimitOverride.limitKey, limitKey),
      ),
    )
    .limit(1);

  if (override) {
    return override.limitValue ?? null; // null = unlimited
  }

  // 2. Get organization's plan
  const [org] = await db
    .select({ planId: organization.planId })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  if (!org?.planId) {
    return 0; // fail-closed: no plan = block
  }

  // 3. Get plan limit definition
  const [limitDef] = await db
    .select({ limitValue: planLimitDefinition.limitValue })
    .from(planLimitDefinition)
    .where(
      and(
        eq(planLimitDefinition.planId, org.planId),
        eq(planLimitDefinition.limitKey, limitKey),
      ),
    )
    .limit(1);

  if (!limitDef) {
    return 0; // fail-closed: no limit definition for this plan+key = block
  }

  return limitDef.limitValue ?? null; // null = unlimited
}

/**
 * Get current resource usage (live COUNT) for an organization and limit key.
 * Centralized to ensure consistent filtering (deletedAt IS NULL etc.) across all call sites.
 * Matches §2.20 table exactly.
 */
export async function getResourceUsage(organizationId: string, limitKey: LimitKey): Promise<number> {
  switch (limitKey) {
    case "max_students": {
      // COUNT DISTINCT athlete where athlete.parent_client_id → client.organization_id = orgId
      const { athlete, client } = await import("@/lib/db/schema");
      const result = await db
        .select({ count: countDistinct(athlete.id) })
        .from(athlete)
        .innerJoin(client, eq(athlete.parentClientId, client.id))
        .where(
          and(
            eq(client.organizationId, organizationId),
            isNull(athlete.deletedAt),
            isNull(client.deletedAt),
          ),
        );
      return result[0]?.count ?? 0;
    }

    case "max_groups": {
      const { groupType } = await import("@/lib/db/schema");
      const result = await db
        .select({ count: count() })
        .from(groupType)
        .where(
          and(
            eq(groupType.organizationId, organizationId),
            isNull(groupType.deletedAt),
          ),
        );
      return result[0]?.count ?? 0;
    }

    case "max_trainers": {
      const { membership } = await import("@/lib/db/schema");
      const result = await db
        .select({ count: count() })
        .from(membership)
        .where(
          and(
            eq(membership.organizationId, organizationId),
            eq(membership.role, "trainer"),
            eq(membership.status, "active"),
          ),
        );
      return result[0]?.count ?? 0;
    }

    case "max_locations": {
      const { location } = await import("@/lib/db/schema");
      const result = await db
        .select({ count: count() })
        .from(location)
        .where(
          and(
            eq(location.organizationId, organizationId),
            isNull(location.deletedAt),
          ),
        );
      return result[0]?.count ?? 0;
    }

    case "max_sessions_per_month": {
      const { classSession } = await import("@/lib/db/schema");
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const result = await db
        .select({ count: count() })
        .from(classSession)
        .where(
          and(
            eq(classSession.organizationId, organizationId),
            gte(classSession.startTime, startOfMonth),
          ),
        );
      return result[0]?.count ?? 0;
    }

    default:
      // Exhaustiveness check — TypeScript will error if a new LimitKey is added without handling
      const _exhaustive: never = limitKey;
      return 0;
  }
}

/**
 * Check if operation would exceed limit. Throws user-facing error if so.
 * Called BEFORE creating the resource (spec §2.20).
 * Also enqueues email notifications when thresholds are hit (F9, EPIK 29).
 */
export async function checkLimit(organizationId: string, limitKey: LimitKey): Promise<void> {
  const limit = await getEffectiveLimit(organizationId, limitKey);
  if (limit === null) return; // unlimited

  const usage = await getResourceUsage(organizationId, limitKey);
  if (usage >= limit) {
    const limitLabels: Record<LimitKey, string> = {
      max_students: "uczniów",
      max_groups: "grup",
      max_trainers: "trenerów",
      max_locations: "lokalizacji",
      max_sessions_per_month: "sesji w miesiącu",
    };
    // Enqueue limit reached notification (once per breach)
    await enqueueLimitReachedNotification(organizationId, limitKey, usage, limit);
    throw new Error(
      `Limit planu: ${usage}/${limit} ${limitLabels[limitKey]}. Przejdź na wyższy plan.`,
    );
  }

  // F9: Enqueue email notification when approaching 80% threshold
  const percentage = Math.round((usage / limit) * 100);
  if (percentage >= 80 && percentage < 100) {
    await enqueueApproachingNotification(organizationId, limitKey, usage, limit, percentage);
  }
}

/**
 * Enqueue plan_limit_approaching email when usage hits 80% threshold.
 * Uses a dedupe key to avoid spamming the same threshold.
 */
async function enqueueApproachingNotification(
  organizationId: string,
  limitKey: LimitKey,
  usage: number,
  limit: number,
  percentage: number,
): Promise<void> {
  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  if (!org) return;

  // Bucket by 5% increments to avoid too many emails (80, 85, 90, 95)
  const bucket = Math.floor(percentage / 5) * 5;
  const dedupeKey = `plan_limit_approaching:${organizationId}:${limitKey}:${bucket}`;

  // Check if we already sent this notification for this bucket
  const { isDeduped } = await import("@/lib/adapters/jobs");
  const alreadySent = await isDeduped(dedupeKey);
  if (alreadySent) return;

  // Find admin users in the organization to notify
  const { membership, user } = await import("@/lib/db/schema");
  const admins = await db
    .select({ email: user.email, name: user.name })
    .from(membership)
    .innerJoin(user, eq(membership.userId, user.id))
    .where(
      and(
        eq(membership.organizationId, organizationId),
        eq(membership.status, "active"),
        eq(membership.role, "admin"),
      ),
    );

  const limitLabels: Record<LimitKey, string> = {
    max_students: "uczniowie",
    max_groups: "grupy",
    max_trainers: "trenerzy",
    max_locations: "lokalizacje",
    max_sessions_per_month: "sesje w miesiącu",
  };

  const billingUrl = `${env.NEXT_PUBLIC_APP_URL}/dashboard/billing`;

  for (const admin of admins) {
    await enqueueEmail(
      db,
      "plan_limit_approaching",
      {
        orgName: org.name,
        limitKey,
        limitLabel: limitLabels[limitKey],
        usage,
        limit,
        percentage,
        upgradeUrl: billingUrl,
      },
      { to: admin.email, name: admin.name || undefined, locale: "pl" },
      { dedupeKey },
    );
  }
}

/**
 * Enqueue plan_limit_reached email when limit is hit (100%).
 * Only sends once per breach.
 */
export async function enqueueLimitReachedNotification(
  organizationId: string,
  limitKey: LimitKey,
  usage: number,
  limit: number,
): Promise<void> {
  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  if (!org) return;

  const dedupeKey = `plan_limit_reached:${organizationId}:${limitKey}`;

  const { isDeduped } = await import("@/lib/adapters/jobs");
  const alreadySent = await isDeduped(dedupeKey);
  if (alreadySent) return;

  const { membership, user } = await import("@/lib/db/schema");
  const admins = await db
    .select({ email: user.email, name: user.name })
    .from(membership)
    .innerJoin(user, eq(membership.userId, user.id))
    .where(
      and(
        eq(membership.organizationId, organizationId),
        eq(membership.status, "active"),
        eq(membership.role, "admin"),
      ),
    );

  const limitLabels: Record<LimitKey, string> = {
    max_students: "uczniowie",
    max_groups: "grupy",
    max_trainers: "trenerzy",
    max_locations: "lokalizacje",
    max_sessions_per_month: "sesje w miesiącu",
  };

  const billingUrl = `${env.NEXT_PUBLIC_APP_URL}/dashboard/billing`;

  for (const admin of admins) {
    await enqueueEmail(
      db,
      "plan_limit_reached",
      {
        orgName: org.name,
        limitKey,
        limitLabel: limitLabels[limitKey],
        usage,
        limit,
        upgradeUrl: billingUrl,
      },
      { to: admin.email, name: admin.name || undefined, locale: "pl" },
      { dedupeKey },
    );
  }
}

/**
 * Check feature flag for organization.
 * Fail-closed: missing flag = disabled.
 */
export async function hasFeature(organizationId: string, featureKey: string): Promise<boolean> {
  const [org] = await db
    .select({ planId: organization.planId })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  if (!org?.planId) return false;

  const [flag] = await db
    .select({ isEnabled: planFeatureFlag.isEnabled })
    .from(planFeatureFlag)
    .where(
      and(
        eq(planFeatureFlag.planId, org.planId),
        eq(planFeatureFlag.featureKey, featureKey),
      ),
    )
    .limit(1);

  return flag?.isEnabled ?? false; // fail-closed
}

/**
 * Get plan details for pricing page / UI (SSR).
 */
export async function getPlanDetails(planCode: string) {
  const [p] = await db
    .select({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      stripePriceId: plan.stripePriceId,
      isCustom: plan.isCustom,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
    })
    .from(plan)
    .where(eq(plan.code, planCode))
    .limit(1);

  if (!p) return null;

  const limits = await db
    .select({ limitKey: planLimitDefinition.limitKey, limitValue: planLimitDefinition.limitValue })
    .from(planLimitDefinition)
    .where(eq(planLimitDefinition.planId, p.id));

  const features = await db
    .select({ featureKey: planFeatureFlag.featureKey, isEnabled: planFeatureFlag.isEnabled })
    .from(planFeatureFlag)
    .where(eq(planFeatureFlag.planId, p.id));

  return {
    ...p,
    limits: Object.fromEntries(limits.map((l) => [l.limitKey, l.limitValue])),
    features: Object.fromEntries(features.map((f) => [f.featureKey, f.isEnabled])),
  };
}

/**
 * Get all active plans for pricing page (SSR).
 */
export async function getAllActivePlans(): Promise<
  Array<{
    id: string;
    code: string;
    name: string;
    stripePriceId: string | null;
    isCustom: boolean;
    isActive: boolean;
    sortOrder: number;
    amount: number | null;
    currency: string | null;
    interval: string | null;
    featured: boolean;
    limits: Record<string, number | null>;
    features: Record<string, boolean>;
  }>
> {
  const plans = await db
    .select({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      stripePriceId: plan.stripePriceId,
      isCustom: plan.isCustom,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
      amount: plan.amount,
      currency: plan.currency,
      interval: plan.interval,
      featured: plan.featured,
    })
    .from(plan)
    .where(eq(plan.isActive, true))
    .orderBy(plan.sortOrder);

  const results = await Promise.all(
    plans.map(async (p) => {
      const limits = await db
        .select({ limitKey: planLimitDefinition.limitKey, limitValue: planLimitDefinition.limitValue })
        .from(planLimitDefinition)
        .where(eq(planLimitDefinition.planId, p.id));

      const features = await db
        .select({ featureKey: planFeatureFlag.featureKey, isEnabled: planFeatureFlag.isEnabled })
        .from(planFeatureFlag)
        .where(eq(planFeatureFlag.planId, p.id));

      return {
        ...p,
        limits: Object.fromEntries(limits.map((l) => [l.limitKey, l.limitValue])),
        features: Object.fromEntries(features.map((f) => [f.featureKey, f.isEnabled])),
      };
    }),
  );

  return results;
}