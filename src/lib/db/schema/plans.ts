import { pgTable, text, timestamp, boolean, integer, unique, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { organization } from "./organizations";

/**
 * plan (v13, EPIK 29)
 *
 * Plan definitions managed by Super Admin. Editable without deploy.
 * GLOBAL table (no organization_id) — plan definitions are shared across all tenants.
 * Tenant reads need permissive SELECT; writes only via system bypass (Super Admin).
 */
export const plan = pgTable(
  "plan",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: text("code").notNull().unique(), // slug, e.g. 'trial', 'basic', 'pro'
    name: text("name").notNull(),
    stripePriceId: text("stripe_price_id"), // nullable for non-commercial plans
    isCustom: boolean("is_custom").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
    // Pricing fields for landing page (Phase 5 / F9)
    amount: integer("amount"), // minor units (cents/grosze), null = free
    currency: text("currency").default("usd"),
    interval: text("interval"), // 'month' | 'year' | null
    featured: boolean("featured").notNull().default(false),
  },
  (t) => [index("plan_code_idx").on(t.code)],
);

/**
 * plan_limit_definition (v13, EPIK 29)
 *
 * Dictionary of numerical limits per plan. Editable by Super Admin without deploy.
 * NULL limit_value = unlimited (explicit, not absence of row).
 * GLOBAL table (no organization_id) — plan definitions are shared across all tenants.
 * Tenant reads need permissive SELECT; writes only via system bypass.
 */
export const planLimitDefinition = pgTable(
  "plan_limit_definition",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    planId: text("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "cascade" }),
    limitKey: text("limit_key").notNull(), // e.g. 'max_students', 'max_groups'
    limitValue: integer("limit_value"), // NULL = unlimited
  },
  (t) => [unique("plan_limit_definition_plan_key_uq").on(t.planId, t.limitKey)],
);

/**
 * plan_feature_flag (v13, EPIK 29)
 *
 * Feature toggles per plan. Boolean only — missing row = fail-closed (disabled).
 * GLOBAL table — same RLS rationale as plan_limit_definition.
 */
export const planFeatureFlag = pgTable(
  "plan_feature_flag",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    planId: text("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "cascade" }),
    featureKey: text("feature_key").notNull(), // e.g. 'subscriptions_enabled'
    isEnabled: boolean("is_enabled").notNull().default(false),
  },
  (t) => [unique("plan_feature_flag_plan_key_uq").on(t.planId, t.featureKey)],
);

/**
 * organization_limit_override (v13, EPIK 29)
 *
 * Per-organization limit exceptions without creating a custom plan.
 * HAS organization_id — standard tenant-scoped RLS (tenant_isolation + system_bypass).
 * Overrides always win over plan limits (checked first in getEffectiveLimit).
 */
export const organizationLimitOverride = pgTable(
  "organization_limit_override",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    limitKey: text("limit_key").notNull(),
    limitValue: integer("limit_value"), // NULL = unlimited
  },
  (t) => [unique("organization_limit_override_org_key_uq").on(t.organizationId, t.limitKey)],
);