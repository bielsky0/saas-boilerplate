"use server";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { withSystemBypass } from "@/lib/db/system";
import {
  organizationLimitOverride,
  plan,
  planFeatureFlag,
  planLimitDefinition,
} from "@/lib/db/schema";
import { recordAudit } from "@/features/admin/audit";
import { requireSuperAdmin } from "@/features/admin/context";
import type { FormState } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const ADMIN_IMMUNE = "This user is a super admin. Revoke super-admin access first.";

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/**
 * Plan CRUD (F9, EPIK 29) — all writes audited with SuperAdmin actor.
 * Runs under system bypass because plan tables are global (no organization_id).
 */

const createPlanSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  stripePriceId: z.string().optional().nullable(),
  isCustom: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

const updatePlanSchema = createPlanSchema.partial().extend({
  id: z.string().min(1),
});

const deletePlanSchema = z.object({
  id: z.string().min(1),
});

const limitDefSchema = z.object({
  planId: z.string().min(1),
  limitKey: z.string().min(1).max(50),
  limitValue: z.coerce.number().int().optional().nullable(),
});

const featureFlagSchema = z.object({
  planId: z.string().min(1),
  featureKey: z.string().min(1).max(50),
  isEnabled: z.coerce.boolean().default(false),
});

const overrideSchema = z.object({
  organizationId: z.string().min(1),
  limitKey: z.string().min(1).max(50),
  limitValue: z.coerce.number().int().optional().nullable(),
});

/**
 * Get all plans with their limits and features (for admin list).
 */
export async function getPlansWithDetails() {
  await requireSuperAdmin();
  return db
    .select({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      stripePriceId: plan.stripePriceId,
      isCustom: plan.isCustom,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    })
    .from(plan)
    .where(isNull(plan.deletedAt))
    .orderBy(plan.sortOrder);
}

/**
 * Get a single plan with its limits and features (for edit form).
 */
export async function getPlanWithDetails(planId: string) {
  await requireSuperAdmin();
  const [p] = await db
    .select()
    .from(plan)
    .where(and(eq(plan.id, planId), isNull(plan.deletedAt)))
    .limit(1);

  if (!p) return null;

  const [limits, features] = await Promise.all([
    db
      .select({ limitKey: planLimitDefinition.limitKey, limitValue: planLimitDefinition.limitValue })
      .from(planLimitDefinition)
      .where(eq(planLimitDefinition.planId, planId)),
    db
      .select({ featureKey: planFeatureFlag.featureKey, isEnabled: planFeatureFlag.isEnabled })
      .from(planFeatureFlag)
      .where(eq(planFeatureFlag.planId, planId)),
  ]);

  return {
    ...p,
    limits: Object.fromEntries(limits.map((l) => [l.limitKey, l.limitValue])),
    features: Object.fromEntries(features.map((f) => [f.featureKey, f.isEnabled])),
  };
}

/**
 * Get all organization limit overrides (for admin list).
 */
export async function getAllOrgOverrides() {
  await requireSuperAdmin();
  return db
    .select({
      id: organizationLimitOverride.id,
      organizationId: organizationLimitOverride.organizationId,
      limitKey: organizationLimitOverride.limitKey,
      limitValue: organizationLimitOverride.limitValue,
    })
    .from(organizationLimitOverride)
    .orderBy(organizationLimitOverride.organizationId, organizationLimitOverride.limitKey);
}

/**
 * Create a new plan.
 */
export async function createPlanAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSuperAdmin();

  const parsed = createPlanSchema.safeParse({
    code: str(formData.get("code")),
    name: str(formData.get("name")),
    stripePriceId: str(formData.get("stripePriceId")) || null,
    isCustom: formData.get("isCustom") === "on",
    isActive: formData.get("isActive") === "on",
    sortOrder: Number(str(formData.get("sortOrder"))) || 0,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { code, name, stripePriceId, isCustom, isActive, sortOrder } = parsed.data;

  await withSystemBypass("super admin: create plan", async (tx) => {
    const [row] = await tx
      .insert(plan)
      .values({
        code,
        name,
        stripePriceId,
        isCustom,
        isActive,
        sortOrder,
      })
      .returning({ id: plan.id });

    await recordAudit(tx, {
      action: "plan.create",
      actor: { actorType: "SuperAdmin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
      organizationId: null,
      targetType: "plan",
      targetId: row.id,
      targetLabel: code,
      metadata: { name, isCustom, isActive, sortOrder, stripePriceId },
    });
  });

  revalidatePath("/admin/plans");
  return { success: `Plan "${name}" created.` };
}

/**
 * Update an existing plan.
 */
export async function updatePlanAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSuperAdmin();

  const parsed = updatePlanSchema.safeParse({
    id: str(formData.get("id")),
    code: str(formData.get("code")) || undefined,
    name: str(formData.get("name")) || undefined,
    stripePriceId: str(formData.get("stripePriceId")) || null,
    isCustom: formData.get("isCustom") === "on" ? true : formData.has("isCustom") ? false : undefined,
    isActive: formData.get("isActive") === "on" ? true : formData.has("isActive") ? false : undefined,
    sortOrder: formData.has("sortOrder") ? Number(str(formData.get("sortOrder"))) : undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { id, ...data } = parsed.data;
  const updates = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

  await withSystemBypass("super admin: update plan", async (tx) => {
    const [before] = await tx
      .select()
      .from(plan)
      .where(eq(plan.id, id))
      .limit(1);

    if (!before) return { error: "Plan not found" };

    await tx.update(plan).set({ ...updates, updatedAt: new Date() }).where(eq(plan.id, id));

    await recordAudit(tx, {
      action: "plan.update",
      actor: { actorType: "SuperAdmin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
      organizationId: null,
      targetType: "plan",
      targetId: id,
      targetLabel: before.code,
      metadata: { changes: updates, from: before },
    });
  });

  revalidatePath("/admin/plans");
  return { success: "Plan updated." };
}

/**
 * Soft-delete a plan.
 */
export async function deletePlanAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSuperAdmin();

  const parsed = deletePlanSchema.safeParse({ id: str(formData.get("id")) });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await withSystemBypass("super admin: delete plan", async (tx) => {
    const [before] = await tx
      .select()
      .from(plan)
      .where(eq(plan.id, parsed.data.id))
      .limit(1);

    if (!before) return { error: "Plan not found" };

    await tx.update(plan).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(plan.id, parsed.data.id));

    await recordAudit(tx, {
      action: "plan.delete",
      actor: { actorType: "SuperAdmin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
      organizationId: null,
      targetType: "plan",
      targetId: parsed.data.id,
      targetLabel: before.code,
      metadata: { deleted: true },
    });
  });

  revalidatePath("/admin/plans");
  return { success: "Plan deleted." };
}

/**
 * Create or update a plan limit definition.
 */
export async function upsertPlanLimitAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSuperAdmin();

  const parsed = limitDefSchema.safeParse({
    planId: str(formData.get("planId")),
    limitKey: str(formData.get("limitKey")),
    limitValue: str(formData.get("limitValue")) || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await withSystemBypass("super admin: upsert plan limit", async (tx) => {
    const [before] = await tx
      .select()
      .from(planLimitDefinition)
      .where(
        and(
          eq(planLimitDefinition.planId, parsed.data.planId),
          eq(planLimitDefinition.limitKey, parsed.data.limitKey),
        ),
      )
      .limit(1);

    const applied = await tx
      .insert(planLimitDefinition)
      .values({
        planId: parsed.data.planId,
        limitKey: parsed.data.limitKey,
        limitValue: parsed.data.limitValue,
      })
      .onConflictDoUpdate({
        target: [planLimitDefinition.planId, planLimitDefinition.limitKey],
        set: { limitValue: parsed.data.limitValue },
      })
      .returning({ planId: planLimitDefinition.planId, limitKey: planLimitDefinition.limitKey });

    if (applied.length === 0) return;

    await recordAudit(tx, {
      action: before ? "plan_limit_definition.update" : "plan_limit_definition.create",
      actor: { actorType: "SuperAdmin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
      organizationId: null,
      targetType: "plan_limit_definition",
      targetId: `${parsed.data.planId}:${parsed.data.limitKey}`,
      targetLabel: parsed.data.limitKey,
      metadata: {
        planId: parsed.data.planId,
        limitKey: parsed.data.limitKey,
        from: before?.limitValue ?? null,
        to: parsed.data.limitValue ?? null,
      },
    });
  });

  revalidatePath("/admin/plans");
  return { success: "Limit definition saved." };
}

/**
 * Delete a plan limit definition.
 */
export async function deletePlanLimitAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSuperAdmin();

  const planId = str(formData.get("planId"));
  const limitKey = str(formData.get("limitKey"));

  if (!planId || !limitKey) return { error: "Missing planId or limitKey" };

  await withSystemBypass("super admin: delete plan limit", async (tx) => {
    const [before] = await tx
      .select()
      .from(planLimitDefinition)
      .where(
        and(
          eq(planLimitDefinition.planId, planId),
          eq(planLimitDefinition.limitKey, limitKey),
        ),
      )
      .limit(1);

    if (!before) return { error: "Limit definition not found" };

    await tx
      .delete(planLimitDefinition)
      .where(
        and(
          eq(planLimitDefinition.planId, planId),
          eq(planLimitDefinition.limitKey, limitKey),
        ),
      );

    await recordAudit(tx, {
      action: "plan_limit_definition.delete",
      actor: { actorType: "SuperAdmin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
      organizationId: null,
      targetType: "plan_limit_definition",
      targetId: `${planId}:${limitKey}`,
      targetLabel: limitKey,
      metadata: { planId, limitKey, deletedValue: before.limitValue },
    });
  });

  revalidatePath("/admin/plans");
  return { success: "Limit definition deleted." };
}

/**
 * Create or update a plan feature flag.
 */
export async function upsertPlanFeatureAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSuperAdmin();

  const parsed = featureFlagSchema.safeParse({
    planId: str(formData.get("planId")),
    featureKey: str(formData.get("featureKey")),
    isEnabled: formData.get("isEnabled") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await withSystemBypass("super admin: upsert plan feature", async (tx) => {
    const [before] = await tx
      .select()
      .from(planFeatureFlag)
      .where(
        and(
          eq(planFeatureFlag.planId, parsed.data.planId),
          eq(planFeatureFlag.featureKey, parsed.data.featureKey),
        ),
      )
      .limit(1);

    await tx
      .insert(planFeatureFlag)
      .values({
        planId: parsed.data.planId,
        featureKey: parsed.data.featureKey,
        isEnabled: parsed.data.isEnabled,
      })
      .onConflictDoUpdate({
        target: [planFeatureFlag.planId, planFeatureFlag.featureKey],
        set: { isEnabled: parsed.data.isEnabled },
      });

    await recordAudit(tx, {
      action: before ? "plan_feature_flag.update" : "plan_feature_flag.create",
      actor: { actorType: "SuperAdmin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
      organizationId: null,
      targetType: "plan_feature_flag",
      targetId: `${parsed.data.planId}:${parsed.data.featureKey}`,
      targetLabel: parsed.data.featureKey,
      metadata: {
        planId: parsed.data.planId,
        featureKey: parsed.data.featureKey,
        from: before?.isEnabled ?? false,
        to: parsed.data.isEnabled,
      },
    });
  });

  revalidatePath("/admin/plans");
  return { success: "Feature flag saved." };
}

/**
 * Delete a plan feature flag.
 */
export async function deletePlanFeatureAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSuperAdmin();

  const planId = str(formData.get("planId"));
  const featureKey = str(formData.get("featureKey"));

  if (!planId || !featureKey) return { error: "Missing planId or featureKey" };

  await withSystemBypass("super admin: delete plan feature", async (tx) => {
    const [before] = await tx
      .select()
      .from(planFeatureFlag)
      .where(
        and(
          eq(planFeatureFlag.planId, planId),
          eq(planFeatureFlag.featureKey, featureKey),
        ),
      )
      .limit(1);

    if (!before) return { error: "Feature flag not found" };

    await tx
      .delete(planFeatureFlag)
      .where(
        and(
          eq(planFeatureFlag.planId, planId),
          eq(planFeatureFlag.featureKey, featureKey),
        ),
      );

    await recordAudit(tx, {
      action: "plan_feature_flag.delete",
      actor: { actorType: "SuperAdmin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
      organizationId: null,
      targetType: "plan_feature_flag",
      targetId: `${planId}:${featureKey}`,
      targetLabel: featureKey,
      metadata: { planId, featureKey, deletedValue: before.isEnabled },
    });
  });

  revalidatePath("/admin/plans");
  return { success: "Feature flag deleted." };
}

/**
 * Create or update an organization limit override.
 */
export async function upsertOrgOverrideAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSuperAdmin();

  const parsed = overrideSchema.safeParse({
    organizationId: str(formData.get("organizationId")),
    limitKey: str(formData.get("limitKey")),
    limitValue: str(formData.get("limitValue")) || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await withSystemBypass("super admin: upsert org override", async (tx) => {
    const [before] = await tx
      .select()
      .from(organizationLimitOverride)
      .where(
        and(
          eq(organizationLimitOverride.organizationId, parsed.data.organizationId),
          eq(organizationLimitOverride.limitKey, parsed.data.limitKey),
        ),
      )
      .limit(1);

    await tx
      .insert(organizationLimitOverride)
      .values({
        organizationId: parsed.data.organizationId,
        limitKey: parsed.data.limitKey,
        limitValue: parsed.data.limitValue,
      })
      .onConflictDoUpdate({
        target: [organizationLimitOverride.organizationId, organizationLimitOverride.limitKey],
        set: { limitValue: parsed.data.limitValue },
      });

    await recordAudit(tx, {
      action: before ? "organization_limit_override.update" : "organization_limit_override.create",
      actor: { actorType: "SuperAdmin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
      organizationId: parsed.data.organizationId,
      targetType: "organization_limit_override",
      targetId: `${parsed.data.organizationId}:${parsed.data.limitKey}`,
      targetLabel: parsed.data.limitKey,
      metadata: {
        organizationId: parsed.data.organizationId,
        limitKey: parsed.data.limitKey,
        from: before?.limitValue ?? null,
        to: parsed.data.limitValue ?? null,
      },
    });
  });

  revalidatePath("/admin/plans");
  return { success: "Override saved." };
}

/**
 * Delete an organization limit override.
 */
export async function deleteOrgOverrideAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireSuperAdmin();

  const organizationId = str(formData.get("organizationId"));
  const limitKey = str(formData.get("limitKey"));

  if (!organizationId || !limitKey) return { error: "Missing organizationId or limitKey" };

  await withSystemBypass("super admin: delete org override", async (tx) => {
    const [before] = await tx
      .select()
      .from(organizationLimitOverride)
      .where(
        and(
          eq(organizationLimitOverride.organizationId, organizationId),
          eq(organizationLimitOverride.limitKey, limitKey),
        ),
      )
      .limit(1);

    if (!before) return { error: "Override not found" };

    await tx
      .delete(organizationLimitOverride)
      .where(
        and(
          eq(organizationLimitOverride.organizationId, organizationId),
          eq(organizationLimitOverride.limitKey, limitKey),
        ),
      );

    await recordAudit(tx, {
      action: "organization_limit_override.delete",
      actor: { actorType: "SuperAdmin", actorId: ctx.actorId, actorEmail: ctx.actorEmail },
      organizationId,
      targetType: "organization_limit_override",
      targetId: `${organizationId}:${limitKey}`,
      targetLabel: limitKey,
      metadata: { organizationId, limitKey, deletedValue: before.limitValue },
    });
  });

  revalidatePath("/admin/plans");
  return { success: "Override deleted." };
}