-- ============================================================
-- MIGRATION: 0028_faza9_plans_limits.sql
-- Phase 9 — Plans & Limits (EPIK 29)
-- ============================================================

-- 1. plan table (GLOBAL — no organization_id)
CREATE TABLE plan (
  id              text PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,        -- slug, e.g. 'trial', 'basic', 'pro'
  name            text NOT NULL,
  stripe_price_id text,                        -- nullable for non-commercial plans
  is_custom       boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

ALTER TABLE plan ENABLE ROW LEVEL SECURITY;

-- Permissive SELECT for ALL (tenants need to read plan data for limits/features)
CREATE POLICY plan_select_all ON plan
  FOR SELECT USING (true);

-- System bypass for Super Admin writes (INSERT/UPDATE/DELETE)
CREATE POLICY plan_system_bypass ON plan
  USING (current_setting('app.is_system_bypass', true) = 'true')
  WITH CHECK (current_setting('app.is_system_bypass', true) = 'true');

-- 2. plan_limit_definition table (GLOBAL — no organization_id)
CREATE TABLE plan_limit_definition (
  id         text PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    text NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  limit_key  text NOT NULL,                   -- e.g. 'max_students', 'max_groups'
  limit_value integer,                        -- NULL = unlimited
  UNIQUE (plan_id, limit_key)
);

ALTER TABLE plan_limit_definition ENABLE ROW LEVEL SECURITY;

-- Permissive SELECT for ALL (tenants read limits during enforcement)
CREATE POLICY plan_limit_definition_select_all ON plan_limit_definition
  FOR SELECT USING (true);

-- System bypass for Super Admin writes
CREATE POLICY plan_limit_definition_system_bypass ON plan_limit_definition
  USING (current_setting('app.is_system_bypass', true) = 'true')
  WITH CHECK (current_setting('app.is_system_bypass', true) = 'true');

-- 3. plan_feature_flag table (GLOBAL — no organization_id)
CREATE TABLE plan_feature_flag (
  id          text PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     text NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  feature_key text NOT NULL,                  -- e.g. 'subscriptions_enabled'
  is_enabled  boolean NOT NULL DEFAULT false,
  UNIQUE (plan_id, feature_key)
);

ALTER TABLE plan_feature_flag ENABLE ROW LEVEL SECURITY;

-- Permissive SELECT for ALL (tenants read feature flags during gating)
CREATE POLICY plan_feature_flag_select_all ON plan_feature_flag
  FOR SELECT USING (true);

-- System bypass for Super Admin writes
CREATE POLICY plan_feature_flag_system_bypass ON plan_feature_flag
  USING (current_setting('app.is_system_bypass', true) = 'true')
  WITH CHECK (current_setting('app.is_system_bypass', true) = 'true');

-- 4. organization_limit_override table (HAS organization_id — STANDARD RLS)
CREATE TABLE organization_limit_override (
  id              text PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  limit_key       text NOT NULL,
  limit_value     integer,                     -- NULL = unlimited
  UNIQUE (organization_id, limit_key)
);

ALTER TABLE organization_limit_override ENABLE ROW LEVEL SECURITY;

-- TENANT ISOLATION POLICY (matches 0015–0017 pattern exactly)
CREATE POLICY organization_limit_override_tenant_isolation ON organization_limit_override
  USING (organization_id = current_setting('app.organization_id'));

-- SYSTEM BYPASS POLICY (for Super Admin cross-tenant operations)
CREATE POLICY organization_limit_override_system_bypass ON organization_limit_override
  USING (current_setting('app.is_system_bypass', true) = 'true')
  WITH CHECK (current_setting('app.is_system_bypass', true) = 'true');

-- 5. Seed trial plan FIRST (before adding FK to organization)
INSERT INTO plan (id, code, name, is_active, sort_order)
VALUES ('trial', 'trial', 'Trial', true, 0)
ON CONFLICT (code) DO NOTHING;

-- Seed default limits for trial (FREE TIER CAPS — ~10 active clients)
INSERT INTO plan_limit_definition (plan_id, limit_key, limit_value)
VALUES
  ('trial', 'max_students', 10),
  ('trial', 'max_groups', 3),
  ('trial', 'max_trainers', 2),
  ('trial', 'max_locations', 1),
  ('trial', 'max_sessions_per_month', 50)
ON CONFLICT (plan_id, limit_key) DO NOTHING;

-- Seed default feature flags for trial (all disabled)
INSERT INTO plan_feature_flag (plan_id, feature_key, is_enabled)
VALUES
  ('trial', 'subscriptions_enabled', false),
  ('trial', 'multi_location', false),
  ('trial', 'policy_documents', false),
  ('trial', 'invoice_tracking', false)
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- 5b. Add plan_id to organization table (after trial plan exists)
ALTER TABLE organization
  ADD COLUMN plan_id text NOT NULL DEFAULT 'trial'
  REFERENCES plan(id) ON DELETE RESTRICT;

-- Index for common lookups
CREATE INDEX organization_plan_id_idx ON organization(plan_id);

-- 6. Seed default limits for trial (FREE TIER CAPS — ~10 active clients)
INSERT INTO plan_limit_definition (plan_id, limit_key, limit_value)
VALUES
  ('trial', 'max_students', 10),
  ('trial', 'max_groups', 3),
  ('trial', 'max_trainers', 2),
  ('trial', 'max_locations', 1),
  ('trial', 'max_sessions_per_month', 50)
ON CONFLICT (plan_id, limit_key) DO NOTHING;

-- Seed default feature flags for trial (all disabled)
INSERT INTO plan_feature_flag (plan_id, feature_key, is_enabled)
VALUES
  ('trial', 'subscriptions_enabled', false),
  ('trial', 'multi_location', false),
  ('trial', 'policy_documents', false),
  ('trial', 'invoice_tracking', false)
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- Backfill existing organizations
UPDATE organization SET plan_id = 'trial' WHERE plan_id IS NULL;