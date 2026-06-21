-- ============================================
-- 012: Additional Performance Indexes
-- Adds indexes for common join patterns and
-- frequently filtered queries identified during
-- the performance audit.
--
-- Key additions:
--   1. payment_verifications(booking_id) — for JOIN with bookings table
--   2. payment_verifications(customer_id) — for customer lookups
--   3. payment_verifications(reviewed_by) — for reviewer JOIN
--   4. bookings(shop_id, date, start_time) — for calendar/slot queries
--   5. loyalty_points(shop_id, customer_id, type) — for balance queries
--   6. shops(address_city) — for shop search/filter by city
-- ============================================

-- ─── PAYMENT_VERIFICATIONS ──────────────────

-- JOIN with bookings table — used in payment-verifications index.get.ts
CREATE INDEX IF NOT EXISTS idx_pv_booking_id
  ON payment_verifications (booking_id);

-- Customer lookups in payment verification enrichment
CREATE INDEX IF NOT EXISTS idx_pv_customer_id
  ON payment_verifications (customer_id);

-- Reviewer JOIN in payment verification enrichment
CREATE INDEX IF NOT EXISTS idx_pv_reviewed_by
  ON payment_verifications (reviewed_by);

-- ─── BOOKINGS ───────────────────────────────

-- Calendar/slot queries: "get bookings for shop X on date Y at time Z"
CREATE INDEX IF NOT EXISTS idx_bookings_shop_date_time
  ON bookings (shop_id, date, start_time);

-- Customer booking list queries
CREATE INDEX IF NOT EXISTS idx_bookings_customer_status_date
  ON bookings (customer_id, status, date);

-- ─── LOYALTY_POINTS ─────────────────────────

-- Balance calculation queries (type-aware filtering)
-- Already has idx_loyalty_points_shop_customer but this adds type prefix
CREATE INDEX IF NOT EXISTS idx_lp_shop_customer_type
  ON loyalty_points (shop_id, customer_id, type);

-- ─── ACTIVITY_LOGS ─────────────────────────

-- Super-admin dashboard: "get recent upgrades by action"
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_created
  ON activity_logs (action, created_at DESC);

-- ─── USERS ─────────────────────────────────

-- Authentication/profile queries
CREATE INDEX IF NOT EXISTS idx_users_email_lookup
  ON users (email);

-- ─── SHOPS ─────────────────────────────────

-- Search/filter by city (used in /api/shops endpoint)
CREATE INDEX IF NOT EXISTS idx_shops_address_city
  ON shops (address_city);

-- ─── BARBERS ───────────────────────────────

-- JOIN with users table for display_name resolution
CREATE INDEX IF NOT EXISTS idx_barbers_user_id_shop
  ON barbers (user_id, shop_id);