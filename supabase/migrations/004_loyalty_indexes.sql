-- ============================================
-- Loyalty indexes for efficient querying
-- Phase 7: Loyalty Reward Program
-- ============================================

-- Index for expiry cron: find expiring records quickly
CREATE INDEX IF NOT EXISTS idx_loyalty_points_expires_at
  ON loyalty_points (expires_at)
  WHERE expires_at IS NOT NULL AND type IN ('earned', 'welcome_bonus');

-- Index for customer balance lookup (most recent entry)
CREATE INDEX IF NOT EXISTS idx_loyalty_points_shop_customer
  ON loyalty_points (shop_id, customer_id, created_at DESC);

-- Index for tier calculation: sum points by type per customer
CREATE INDEX IF NOT EXISTS idx_loyalty_points_type
  ON loyalty_points (shop_id, customer_id, type);

-- Index for bookings with points (used by admin queries)
CREATE INDEX IF NOT EXISTS idx_bookings_points_earned
  ON bookings (shop_id, points_earned)
  WHERE points_earned > 0;

CREATE INDEX IF NOT EXISTS idx_bookings_points_redeemed
  ON bookings (shop_id, points_redeemed)
  WHERE points_redeemed > 0;

-- Index for loyalty rewards active lookup (used by booking wizard)
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_active
  ON loyalty_rewards (shop_id, is_active)
  WHERE is_active = true;
