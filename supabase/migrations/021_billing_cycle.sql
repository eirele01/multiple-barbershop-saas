-- Migration 020: Billing Cycle (Monthly / Yearly Subscriptions)
--
-- Adds a billing interval to shops so subscriptions can expire and renew.
-- The expiry timestamp itself reuses the existing shops.plan_end_date column
-- (defined in 001_initial_schema.sql) — no new expiry column needed.
--
-- Semantics:
--   plan_end_date IS NULL          → no expiry (free plan or manual grant)
--   plan_end_date < now()          → expired (7-day grace handled in app code)
--   billing_interval               → which period the last payment covered

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS billing_interval TEXT NOT NULL DEFAULT 'monthly';

ALTER TABLE shops
  DROP CONSTRAINT IF EXISTS shops_billing_interval_check;
ALTER TABLE shops
  ADD CONSTRAINT shops_billing_interval_check
  CHECK (billing_interval IN ('monthly', 'yearly'));
