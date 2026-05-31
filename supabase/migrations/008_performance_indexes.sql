-- ============================================
-- 008: Performance Indexes
-- Adds composite and missing indexes for common
-- query patterns across bookings, loyalty_points,
-- payment_verifications, and activity_logs.
--
-- Uses CREATE INDEX IF NOT EXISTS for safety.
-- ============================================

-- ─── BOOKINGS ───────────────────────────────

-- Daily booking fetches: "get all bookings for shop X on date Y"
CREATE INDEX IF NOT EXISTS idx_bookings_shop_date
  ON bookings (shop_id, date);

-- Filtered booking lists: "get pending/confirmed bookings for shop X"
CREATE INDEX IF NOT EXISTS idx_bookings_shop_status
  ON bookings (shop_id, status);

-- NOTE: (customer_id) already covered by idx_bookings_customer_id in 001_initial_schema.sql

-- Availability checks: "is barber X free on date Y?"
CREATE INDEX IF NOT EXISTS idx_bookings_barber_date
  ON bookings (barber_id, date);

-- PayMongo webhook lookups: "find booking by payment_id"
CREATE INDEX IF NOT EXISTS idx_bookings_paymongo_payment_id
  ON bookings (paymongo_payment_id)
  WHERE paymongo_payment_id IS NOT NULL;

-- ─── LOYALTY_POINTS ─────────────────────────

-- NOTE: (shop_id, customer_id) already covered as prefix of
--       idx_loyalty_points_shop_customer in 004_loyalty_indexes.sql

-- Customer history across shops: "show me all my loyalty transactions for shop X with type Y"
-- Column order differs from existing idx_loyalty_points_type (shop_id, customer_id, type)
-- to optimise for customer-first queries.
CREATE INDEX IF NOT EXISTS idx_loyalty_points_customer_shop_type
  ON loyalty_points (customer_id, shop_id, type);

-- NOTE: (expires_at) WHERE expires_at IS NOT NULL is already covered by
--       idx_loyalty_points_expires_at in 004_loyalty_indexes.sql (with additional type filter)

-- ─── PAYMENT_VERIFICATIONS ──────────────────

-- Queue queries: "get all pending verifications for shop X"
-- Replaces separate single-column indexes for this common AND pattern.
CREATE INDEX IF NOT EXISTS idx_payment_verifications_shop_status
  ON payment_verifications (shop_id, status);

-- ─── ACTIVITY_LOGS ──────────────────────────

-- Log viewing: "show recent activity for shop X, newest first"
CREATE INDEX IF NOT EXISTS idx_activity_logs_shop_created_at
  ON activity_logs (shop_id, created_at DESC);

-- Analytics: "count/describe actions over time"
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_created_at
  ON activity_logs (action, created_at);
