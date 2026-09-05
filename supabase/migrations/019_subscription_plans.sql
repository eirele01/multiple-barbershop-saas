-- Migration 019: Subscription Plans Table (Dynamic Tier Maker)
-- Enables the super-admin to define plan tiers dynamically (name, price,
-- resource limits, features) instead of hardcoding basic/upgraded.
--
-- Convention: limits use -1 to mean "unlimited" (JSON cannot store Infinity).
--          0  means "not included".

CREATE TABLE IF NOT EXISTS plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,                -- stable machine key (e.g. 'basic')
  name          TEXT NOT NULL,                       -- display name (e.g. 'Basic')
  description   TEXT,
  price_monthly INTEGER NOT NULL DEFAULT 0,          -- in centavos; 0 = free
  price_yearly  INTEGER NOT NULL DEFAULT 0,          -- in centavos; 0 = free
  limits        JSONB NOT NULL DEFAULT '{
    "services": 0,
    "gallery": 0,
    "products": 0,
    "staff": 0
  }'::jsonb,
  features      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- marketing feature list
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_default    BOOLEAN NOT NULL DEFAULT false,      -- fallback plan for new shops
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Code format guard (same codes the app already uses)
CREATE OR REPLACE FUNCTION plans_code_check() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'plan code must be lowercase alphanumeric/underscore: %', NEW.code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plans_code_check ON plans;
CREATE TRIGGER trg_plans_code_check
  BEFORE INSERT OR UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION plans_code_check();

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at_plans() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plans_updated_at ON plans;
CREATE TRIGGER trg_plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_plans();

-- ============================================
-- Seed the two existing plans
-- ============================================
INSERT INTO plans (code, name, description, price_monthly, price_yearly, limits, features, is_active, is_default, sort_order)
VALUES
  (
    'basic', 'Basic',
    'Perfect for getting started with the essentials.',
    0, 0,
    '{"services":10,"gallery":20,"products":10,"staff":5}'::jsonb,
    '["Services: 10","Gallery images: 20","Products: 10","Staff members: 5","Manual QR payments"]'::jsonb,
    true, true, 1
  ),
  (
    'upgraded', 'Upgraded',
    'For growing businesses that need more.',
    199000, 1990000,
    '{"services":-1,"gallery":-1,"products":-1,"staff":-1}'::jsonb,
    '["Unlimited services","Unlimited gallery images","Unlimited products","Unlimited staff members","Manual QR payments","PayMongo payments","Priority support"]'::jsonb,
    true, false, 2
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order;

-- ============================================
-- Allow future plan codes on shops.plan
-- (drop the hardcoded CHECK that only allows basic|upgraded)
-- ============================================
ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_plan_check;

-- ============================================
-- RLS: readable by authenticated users (needed for pricing),
-- managed only via service-role APIs (super-admin routes use service key).
-- ============================================
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_read_authenticated"
  ON plans
  FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role', 'anon'));

-- Super-admin manages plans via service-role server APIs, so no
-- insert/update/delete policies are required here.