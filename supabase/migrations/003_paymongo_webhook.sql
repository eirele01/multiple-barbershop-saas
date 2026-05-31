-- ============================================
-- MIGRATION 003: PayMongo Webhook & Settings
-- Adds webhook-related columns to the shops table
-- for Phase 5 — PayMongo Integration
-- ============================================

-- Webhook secret (encrypted) for verifying PayMongo webhook signatures
ALTER TABLE shops ADD COLUMN IF NOT EXISTS paymongo_webhook_secret text;

-- Test mode flag — when true, use PayMongo test keys
ALTER TABLE shops ADD COLUMN IF NOT EXISTS paymongo_test_mode boolean DEFAULT true;

-- Webhook URL — stored as plain text, set during settings save
-- (Not a generated/computed column to avoid migration issues)
ALTER TABLE shops ADD COLUMN IF NOT EXISTS paymongo_webhook_url text;

-- Index for webhook lookups (finding shop by slug when webhook fires)
CREATE INDEX IF NOT EXISTS idx_shops_paymongo_enabled ON shops(paymongo_enabled) WHERE paymongo_enabled = true;
