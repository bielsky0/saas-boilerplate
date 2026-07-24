-- ============================================================
-- MIGRATION: 0028_faza9_plan_pricing_fields.sql
-- Phase 9 — Add pricing fields to plan table for landing page
-- ============================================================

-- Add pricing fields to plan table
ALTER TABLE plan
  ADD COLUMN amount integer,
  ADD COLUMN currency text DEFAULT 'usd',
  ADD COLUMN interval text,
  ADD COLUMN featured boolean NOT NULL DEFAULT false;

-- Update trial plan with pricing info
UPDATE plan
SET amount = 0,
    currency = 'pln',
    interval = null,
    featured = false
WHERE code = 'trial';

-- Seed basic plan
INSERT INTO plan (id, code, name, stripe_price_id, is_custom, is_active, sort_order, amount, currency, interval, featured)
VALUES (
  gen_random_uuid(),
  'basic',
  'Basic',
  null,
  false,
  true,
  1,
  9900,
  'pln',
  'month',
  true
)
ON CONFLICT (code) DO NOTHING;

-- Seed pro plan
INSERT INTO plan (id, code, name, stripe_price_id, is_custom, is_active, sort_order, amount, currency, interval, featured)
VALUES (
  gen_random_uuid(),
  'pro',
  'Pro',
  null,
  false,
  true,
  2,
  29900,
  'pln',
  'month',
  false
)
ON CONFLICT (code) DO NOTHING;

-- Seed limits and features for basic plan
INSERT INTO plan_limit_definition (plan_id, limit_key, limit_value)
SELECT id, 'max_students', 50 FROM plan WHERE code = 'basic'
ON CONFLICT (plan_id, limit_key) DO NOTHING;

INSERT INTO plan_limit_definition (plan_id, limit_key, limit_value)
SELECT id, 'max_groups', 10 FROM plan WHERE code = 'basic'
ON CONFLICT (plan_id, limit_key) DO NOTHING;

INSERT INTO plan_limit_definition (plan_id, limit_key, limit_value)
SELECT id, 'max_trainers', 5 FROM plan WHERE code = 'basic'
ON CONFLICT (plan_id, limit_key) DO NOTHING;

INSERT INTO plan_limit_definition (plan_id, limit_key, limit_value)
SELECT id, 'max_locations', 3 FROM plan WHERE code = 'basic'
ON CONFLICT (plan_id, limit_key) DO NOTHING;

INSERT INTO plan_limit_definition (plan_id, limit_key, limit_value)
SELECT id, 'max_sessions_per_month', 200 FROM plan WHERE code = 'basic'
ON CONFLICT (plan_id, limit_key) DO NOTHING;

INSERT INTO plan_feature_flag (plan_id, feature_key, is_enabled)
SELECT id, 'subscriptions_enabled', true FROM plan WHERE code = 'basic'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO plan_feature_flag (plan_id, feature_key, is_enabled)
SELECT id, 'multi_location', true FROM plan WHERE code = 'basic'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO plan_feature_flag (plan_id, feature_key, is_enabled)
SELECT id, 'policy_documents', true FROM plan WHERE code = 'basic'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO plan_feature_flag (plan_id, feature_key, is_enabled)
SELECT id, 'invoice_tracking', true FROM plan WHERE code = 'basic'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- Seed limits and features for pro plan
INSERT INTO plan_limit_definition (plan_id, limit_key, limit_value)
SELECT id, 'max_students', 200 FROM plan WHERE code = 'pro'
ON CONFLICT (plan_id, limit_key) DO NOTHING;

INSERT INTO plan_limit_definition (plan_id, limit_key, limit_value)
SELECT id, 'max_groups', 50 FROM plan WHERE code = 'pro'
ON CONFLICT (plan_id, limit_key) DO NOTHING;

INSERT INTO plan_limit_definition (plan_id, limit_key, limit_value)
SELECT id, 'max_trainers', 20 FROM plan WHERE code = 'pro'
ON CONFLICT (plan_id, limit_key) DO NOTHING;

INSERT INTO plan_limit_definition (plan_id, limit_key, limit_value)
SELECT id, 'max_locations', 10 FROM plan WHERE code = 'pro'
ON CONFLICT (plan_id, limit_key) DO NOTHING;

INSERT INTO plan_limit_definition (plan_id, limit_key, limit_value)
SELECT id, 'max_sessions_per_month', 1000 FROM plan WHERE code = 'pro'
ON CONFLICT (plan_id, limit_key) DO NOTHING;

INSERT INTO plan_feature_flag (plan_id, feature_key, is_enabled)
SELECT id, 'subscriptions_enabled', true FROM plan WHERE code = 'pro'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO plan_feature_flag (plan_id, feature_key, is_enabled)
SELECT id, 'multi_location', true FROM plan WHERE code = 'pro'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO plan_feature_flag (plan_id, feature_key, is_enabled)
SELECT id, 'policy_documents', true FROM plan WHERE code = 'pro'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO plan_feature_flag (plan_id, feature_key, is_enabled)
SELECT id, 'invoice_tracking', true FROM plan WHERE code = 'pro'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- Update trial plan limits (already seeded in 0027, but ensure they're correct)
UPDATE plan_limit_definition
SET limit_value = 10
WHERE plan_id = (SELECT id FROM plan WHERE code = 'trial') AND limit_key = 'max_students';

UPDATE plan_limit_definition
SET limit_value = 3
WHERE plan_id = (SELECT id FROM plan WHERE code = 'trial') AND limit_key = 'max_groups';

UPDATE plan_limit_definition
SET limit_value = 2
WHERE plan_id = (SELECT id FROM plan WHERE code = 'trial') AND limit_key = 'max_trainers';

UPDATE plan_limit_definition
SET limit_value = 1
WHERE plan_id = (SELECT id FROM plan WHERE code = 'trial') AND limit_key = 'max_locations';

UPDATE plan_limit_definition
SET limit_value = 50
WHERE plan_id = (SELECT id FROM plan WHERE code = 'trial') AND limit_key = 'max_sessions_per_month';

-- Ensure trial plan features are disabled
UPDATE plan_feature_flag
SET is_enabled = false
WHERE plan_id = (SELECT id FROM plan WHERE code = 'trial');